import { pool } from "../db/pool.js";

export async function listCustomers(req, res) {
  const { search } = req.query;
  let sql = `SELECT c.*,
               (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
               (SELECT COALESCE(SUM(s.amount), 0) FROM sales s WHERE s.customer_id = c.id) AS lifetime_value
             FROM customers c`;
  const params = [];
  if (search) {
    sql += " WHERE c.name LIKE ? OR c.email LIKE ?";
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY c.id DESC";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}

export async function getCustomer(req, res) {
  const [rows] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Customer not found" });
  const [orders] = await pool.query(
    "SELECT id, status, total, order_date FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 20",
    [req.params.id]
  );
  res.json({ ...rows[0], orders });
}

export async function createCustomer(req, res) {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const [result] = await pool.query(
    "INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
    [name, email || null, phone || null, address || null]
  );
  res.status(201).json({ id: result.insertId, name, email, phone, address });
}

export async function updateCustomer(req, res) {
  const { name, email, phone, address } = req.body;
  await pool.query(
    `UPDATE customers SET name = COALESCE(?, name), email = COALESCE(?, email),
       phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?`,
    [name, email, phone, address, req.params.id]
  );
  res.json({ success: true });
}

export async function deleteCustomer(req, res) {
  await pool.query("DELETE FROM customers WHERE id = ?", [req.params.id]);
  res.json({ success: true });
}
