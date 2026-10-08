import { pool } from "../db/pool.js";

export async function listProducts(req, res) {
  const { search } = req.query;
  let sql = `SELECT p.*, v.name AS vendor_name, COALESCE(i.quantity, 0) AS quantity
             FROM products p
             LEFT JOIN vendors v ON v.id = p.vendor_id
             LEFT JOIN inventory i ON i.product_id = p.id`;
  const params = [];
  if (search) {
    sql += " WHERE p.name LIKE ? OR p.sku LIKE ?";
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY p.id DESC";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}

export async function getProduct(req, res) {
  const [rows] = await pool.query(
    `SELECT p.*, v.name AS vendor_name, COALESCE(i.quantity, 0) AS quantity
     FROM products p
     LEFT JOIN vendors v ON v.id = p.vendor_id
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Product not found" });
  res.json(rows[0]);
}

export async function createProduct(req, res) {
  const { sku, name, description, category, price, cost, vendor_id, reorder_level, initial_quantity } = req.body;
  if (!sku || !name || price === undefined) {
    return res.status(400).json({ error: "sku, name and price are required" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO products (sku, name, description, category, price, cost, vendor_id, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [sku, name, description || null, category || null, price, cost || 0, vendor_id || null, reorder_level || 10]
    );
    const productId = result.insertId;
    await conn.query(
      "INSERT INTO inventory (product_id, quantity) VALUES (?, ?)",
      [productId, initial_quantity || 0]
    );
    await conn.commit();
    res.status(201).json({ id: productId, sku, name, quantity: initial_quantity || 0 });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "SKU already exists" });
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateProduct(req, res) {
  const { name, description, category, price, cost, vendor_id, reorder_level } = req.body;
  await pool.query(
    `UPDATE products SET
      name = COALESCE(?, name), description = COALESCE(?, description),
      category = COALESCE(?, category), price = COALESCE(?, price),
      cost = COALESCE(?, cost), vendor_id = COALESCE(?, vendor_id),
      reorder_level = COALESCE(?, reorder_level)
     WHERE id = ?`,
    [name, description, category, price, cost, vendor_id, reorder_level, req.params.id]
  );
  res.json({ success: true });
}

export async function deleteProduct(req, res) {
  await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
  res.json({ success: true });
}
