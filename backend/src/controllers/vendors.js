import { pool } from "../db/pool.js";

export async function listVendors(req, res) {
  const [rows] = await pool.query("SELECT * FROM vendors ORDER BY id DESC");
  res.json(rows);
}

export async function getVendor(req, res) {
  const [rows] = await pool.query("SELECT * FROM vendors WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Vendor not found" });
  res.json(rows[0]);
}

export async function createVendor(req, res) {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const [result] = await pool.query(
    "INSERT INTO vendors (name, email, phone, address) VALUES (?, ?, ?, ?)",
    [name, email || null, phone || null, address || null]
  );
  res.status(201).json({ id: result.insertId, name, email, phone, address });
}

export async function updateVendor(req, res) {
  const { name, email, phone, address } = req.body;
  await pool.query(
    "UPDATE vendors SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), address = COALESCE(?, address) WHERE id = ?",
    [name, email, phone, address, req.params.id]
  );
  res.json({ success: true });
}

export async function deleteVendor(req, res) {
  await pool.query("DELETE FROM vendors WHERE id = ?", [req.params.id]);
  res.json({ success: true });
}
