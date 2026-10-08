import { pool } from "../db/pool.js";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit"];

export async function listSales(req, res) {
  const { from, to } = req.query;
  let sql = `SELECT s.*, c.name AS customer_name, o.status AS order_status
             FROM sales s
             LEFT JOIN customers c ON c.id = s.customer_id
             LEFT JOIN orders o ON o.id = s.order_id`;
  const params = [];
  const where = [];
  if (from) { where.push("s.sale_date >= ?"); params.push(from); }
  if (to) { where.push("s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(to); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY s.id DESC";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}

export async function getSale(req, res) {
  const [rows] = await pool.query(
    `SELECT s.*, c.name AS customer_name FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Sale not found" });
  const sale = rows[0];
  let items = [];
  if (sale.order_id) {
    const [itemRows] = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.sku FROM order_items oi
       JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
      [sale.order_id]
    );
    items = itemRows;
  }
  res.json({ ...sale, items });
}

// Record payment against an existing order. Marks the order completed.
export async function recordSale(req, res) {
  const { order_id, payment_method, amount, note } = req.body;
  if (!order_id) return res.status(400).json({ error: "order_id is required" });
  const method = payment_method || "cash";
  if (!PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: `payment_method must be one of ${PAYMENT_METHODS.join(", ")}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [order_id]);
    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ error: `Order ${order_id} not found` });
    }
    const order = orders[0];
    if (order.status === "cancelled") {
      await conn.rollback();
      return res.status(400).json({ error: `Order ${order_id} is cancelled` });
    }

    const [existing] = await conn.query("SELECT id FROM sales WHERE order_id = ?", [order_id]);
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: `Order ${order_id} is already paid (sale #${existing[0].id})` });
    }

    const saleAmount = amount !== undefined ? Number(amount) : Number(order.total);
    const [result] = await conn.query(
      "INSERT INTO sales (order_id, customer_id, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)",
      [order_id, order.customer_id, saleAmount, method, note || null]
    );
    await conn.query("UPDATE orders SET status = 'completed' WHERE id = ?", [order_id]);
    await conn.commit();
    res.status(201).json({
      id: result.insertId, order_id, amount: saleAmount,
      payment_method: method, order_status: "completed",
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Over-the-counter sale: creates the order, takes the stock, records payment,
// all in one transaction. items = [{ product_id, quantity }]
export async function quickSale(req, res) {
  const { customer_id, items, payment_method, note } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }
  const method = payment_method || "cash";
  if (!PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: `payment_method must be one of ${PAYMENT_METHODS.join(", ")}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let total = 0;
    const resolved = [];
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: "each item needs a positive quantity" });
      }
      const [rows] = await conn.query(
        `SELECT p.id, p.name, p.price, COALESCE(i.quantity, 0) AS stock
         FROM products p LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ? FOR UPDATE`,
        [item.product_id]
      );
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ error: `Product ${item.product_id} not found` });
      }
      if (rows[0].stock < qty) {
        await conn.rollback();
        return res.status(400).json({
          error: `Insufficient stock for ${rows[0].name}: ${rows[0].stock} on hand, ${qty} requested`,
        });
      }
      total += Number(rows[0].price) * qty;
      resolved.push({ product_id: rows[0].id, quantity: qty, unit_price: rows[0].price });
    }

    const [orderResult] = await conn.query(
      "INSERT INTO orders (customer_id, status, total) VALUES (?, 'completed', ?)",
      [customer_id || null, total]
    );
    const orderId = orderResult.insertId;

    for (const item of resolved) {
      await conn.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [orderId, item.product_id, item.quantity, item.unit_price]
      );
      await conn.query("UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?",
        [item.quantity, item.product_id]);
      await conn.query(
        "INSERT INTO inventory_movements (product_id, change_qty, reason) VALUES (?, ?, ?)",
        [item.product_id, -item.quantity, `sale, order #${orderId}`]
      );
    }

    const [saleResult] = await conn.query(
      "INSERT INTO sales (order_id, customer_id, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)",
      [orderId, customer_id || null, total, method, note || null]
    );

    await conn.commit();
    res.status(201).json({
      sale_id: saleResult.insertId, order_id: orderId,
      amount: total, payment_method: method, items: resolved,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Reverse a sale: deletes the payment row and puts the order back to pending.
// Stock is NOT returned here — use an inventory adjustment for that, so the
// movement history shows why the stock came back.
export async function voidSale(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM sales WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Sale not found" });
    }
    const sale = rows[0];
    await conn.query("DELETE FROM sales WHERE id = ?", [req.params.id]);
    if (sale.order_id) {
      await conn.query("UPDATE orders SET status = 'pending' WHERE id = ?", [sale.order_id]);
    }
    await conn.commit();
    res.json({ success: true, voided_sale: sale.id, order_id: sale.order_id });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
