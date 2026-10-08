import { pool } from "../db/pool.js";

export async function listOrders(req, res) {
  const { status } = req.query;
  let sql = `SELECT o.*, c.name AS customer_name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`;
  const params = [];
  if (status) {
    sql += " WHERE o.status = ?";
    params.push(status);
  }
  sql += " ORDER BY o.id DESC";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}

export async function getOrder(req, res) {
  const [orderRows] = await pool.query(
    `SELECT o.*, c.name AS customer_name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
    [req.params.id]
  );
  if (!orderRows.length) return res.status(404).json({ error: "Order not found" });
  const [items] = await pool.query(
    `SELECT oi.*, p.name AS product_name, p.sku FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
    [req.params.id]
  );
  res.json({ ...orderRows[0], items });
}

// Creates an order + line items, decrements inventory. items = [{ product_id, quantity }]
export async function createOrder(req, res) {
  const { customer_id, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let total = 0;
    const resolvedItems = [];
    for (const item of items) {
      const [productRows] = await conn.query(
        "SELECT p.id, p.price, i.quantity FROM products p JOIN inventory i ON i.product_id = p.id WHERE p.id = ? FOR UPDATE",
        [item.product_id]
      );
      if (!productRows.length) throw new Error(`Product ${item.product_id} not found`);
      const product = productRows[0];
      if (product.quantity < item.quantity) {
        await conn.rollback();
        return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
      }
      total += product.price * item.quantity;
      resolvedItems.push({ product_id: item.product_id, quantity: item.quantity, unit_price: product.price });
    }

    const [orderResult] = await conn.query(
      "INSERT INTO orders (customer_id, status, total) VALUES (?, 'pending', ?)",
      [customer_id || null, total]
    );
    const orderId = orderResult.insertId;

    for (const item of resolvedItems) {
      await conn.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [orderId, item.product_id, item.quantity, item.unit_price]
      );
      await conn.query(
        "UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?",
        [item.quantity, item.product_id]
      );
      await conn.query(
        "INSERT INTO inventory_movements (product_id, change_qty, reason) VALUES (?, ?, ?)",
        [item.product_id, -item.quantity, `order #${orderId}`]
      );
    }

    await conn.commit();
    res.status(201).json({ id: orderId, total, status: "pending" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateOrderStatus(req, res) {
  const { status } = req.body;
  const allowed = ["pending", "processing", "shipped", "completed", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
  await pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
  res.json({ success: true });
}

export async function salesSummary(req, res) {
  const [rows] = await pool.query(
    `SELECT DATE(order_date) AS day, COUNT(*) AS order_count, SUM(total) AS revenue
     FROM orders WHERE status != 'cancelled'
     GROUP BY DATE(order_date) ORDER BY day DESC LIMIT 30`
  );
  const [totals] = await pool.query(
    `SELECT COUNT(*) AS total_orders, COALESCE(SUM(total), 0) AS total_revenue
     FROM orders WHERE status != 'cancelled'`
  );
  res.json({ daily: rows, totals: totals[0] });
}
