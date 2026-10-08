import { pool } from "../db/pool.js";

export async function listInventory(req, res) {
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.sku, p.name, p.reorder_level, i.quantity, i.warehouse, i.updated_at
     FROM inventory i JOIN products p ON p.id = i.product_id
     ORDER BY i.quantity ASC`
  );
  res.json(rows);
}

export async function lowStock(req, res) {
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.sku, p.name, p.reorder_level, i.quantity
     FROM inventory i JOIN products p ON p.id = i.product_id
     WHERE i.quantity <= p.reorder_level
     ORDER BY i.quantity ASC`
  );
  res.json(rows);
}

// Adjust stock up or down; positive delta = restock, negative = consumption
export async function adjustStock(req, res) {
  const { product_id, delta, reason } = req.body;
  if (!product_id || delta === undefined) {
    return res.status(400).json({ error: "product_id and delta are required" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE", [product_id]);
    if (!rows.length) {
      await conn.query("INSERT INTO inventory (product_id, quantity) VALUES (?, 0)", [product_id]);
    }
    const newQty = (rows[0]?.quantity || 0) + Number(delta);
    if (newQty < 0) {
      await conn.rollback();
      return res.status(400).json({ error: "Resulting quantity cannot be negative" });
    }
    await conn.query("UPDATE inventory SET quantity = ? WHERE product_id = ?", [newQty, product_id]);
    await conn.query(
      "INSERT INTO inventory_movements (product_id, change_qty, reason) VALUES (?, ?, ?)",
      [product_id, delta, reason || null]
    );
    await conn.commit();
    res.json({ product_id, quantity: newQty });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Recent stock movements, optionally for a single product
export async function listMovements(req, res) {
  const { product_id } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let sql = `SELECT m.*, p.sku, p.name AS product_name
             FROM inventory_movements m JOIN products p ON p.id = m.product_id`;
  const params = [];
  if (product_id) {
    sql += " WHERE m.product_id = ?";
    params.push(product_id);
  }
  sql += " ORDER BY m.id DESC LIMIT ?";
  params.push(limit);
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}
