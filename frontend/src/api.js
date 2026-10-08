// Same-origin API helpers + formatters shared by all views.
export const API = "";
export const BOT = import.meta.env.VITE_CHATBOT_URL || "http://localhost:5001";

export async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const money = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (n) => Number(n || 0).toLocaleString();
export const date = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export const statusClass = (s) => ({ completed: "ok", cancelled: "cancelled", pending: "pending" }[s] || "");

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit"];
export const ORDER_STATUSES = ["pending", "processing", "shipped", "completed", "cancelled"];
export const payLabel = (m) => String(m).replace("_", " ");
