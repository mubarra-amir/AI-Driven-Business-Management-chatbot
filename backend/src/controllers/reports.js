import { pool } from "../db/pool.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "..", "public", "reports");
fs.mkdirSync(REPORTS_DIR, { recursive: true });

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const PERIODS = ["day", "week", "month", "year"];
// The MCP server calls this endpoint over the Docker-internal address
// (http://backend:4000), which your browser can't resolve. PUBLIC_URL is
// what actually goes into the link people click, so it needs to be the
// address your browser uses to reach this backend.
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "");

// Given a period name and an anchor date, return the [start, end] of the
// calendar bucket that date falls in (both inclusive, as Date objects at
// local midnight). "week" is Monday-Sunday.
function periodRange(period, anchor) {
  const d = new Date(anchor);
  if (period === "day") {
    return [new Date(d), new Date(d)];
  }
  if (period === "week") {
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    const start = new Date(d); start.setDate(d.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return [start, end];
  }
  if (period === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [start, end];
  }
  // year
  return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31)];
}

const iso = (d) => d.toISOString().slice(0, 10);
const label = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export async function generateSalesReport(req, res) {
  const period = (req.body.period || "week").toLowerCase();
  if (!PERIODS.includes(period)) {
    return res.status(400).json({ error: `period must be one of ${PERIODS.join(", ")}` });
  }
  const anchor = req.body.date ? new Date(req.body.date) : new Date();
  if (isNaN(anchor)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const [start, end] = periodRange(period, anchor);
  const startStr = iso(start), endStr = iso(end);

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS sale_count, COALESCE(SUM(amount), 0) AS revenue
     FROM sales WHERE DATE(sale_date) BETWEEN ? AND ?`,
    [startStr, endStr]
  );
  // Sub-totals: by day for day/week/month, by month for a year
  const bucketExpr = period === "year" ? "DATE_FORMAT(sale_date, '%Y-%m')" : "DATE(sale_date)";
  const [buckets] = await pool.query(
    `SELECT ${bucketExpr} AS bucket, COUNT(*) AS sale_count, SUM(amount) AS revenue
     FROM sales WHERE DATE(sale_date) BETWEEN ? AND ?
     GROUP BY bucket ORDER BY bucket ASC`,
    [startStr, endStr]
  );
  const [topProducts] = await pool.query(
    `SELECT p.sku, p.name, SUM(oi.quantity) AS units_sold, SUM(oi.quantity * oi.unit_price) AS revenue
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN orders o ON o.id = oi.order_id
     JOIN sales s ON s.order_id = o.id
     WHERE DATE(s.sale_date) BETWEEN ? AND ?
     GROUP BY p.id, p.sku, p.name ORDER BY revenue DESC LIMIT 10`,
    [startStr, endStr]
  );
  const [payMix] = await pool.query(
    `SELECT payment_method, COUNT(*) AS count, SUM(amount) AS revenue
     FROM sales WHERE DATE(sale_date) BETWEEN ? AND ?
     GROUP BY payment_method ORDER BY revenue DESC`,
    [startStr, endStr]
  );

  const filename = `sales-${period}-${startStr}_${endStr}-${Date.now()}.pdf`;
  const filepath = path.join(REPORTS_DIR, filename);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);

    doc.fontSize(20).text("Sales Report", { align: "left" });
    doc.fontSize(11).fillColor("#555")
      .text(`${period[0].toUpperCase()}${period.slice(1)}ly period: ${label(start)} \u2013 ${label(end)}`)
      .text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#000").text("Summary");
    doc.fontSize(11).fillColor("#333")
      .text(`Revenue: ${money(totals.revenue)}`)
      .text(`Sales recorded: ${totals.sale_count}`)
      .text(`Average sale: ${money(totals.sale_count ? totals.revenue / totals.sale_count : 0)}`);
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#000").text(period === "year" ? "Revenue by month" : "Revenue by day");
    doc.fontSize(10).fillColor("#333");
    if (buckets.length === 0) {
      doc.text("No sales recorded in this period.");
    } else {
      buckets.forEach((b) => doc.text(`${b.bucket}    ${money(b.revenue)}    (${b.sale_count} sale${b.sale_count === 1 ? "" : "s"})`));
    }
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#000").text("Top products");
    doc.fontSize(10).fillColor("#333");
    if (topProducts.length === 0) {
      doc.text("No product sales in this period.");
    } else {
      topProducts.forEach((p) =>
        doc.text(`${p.sku}  ${p.name}  \u2013  ${p.units_sold} units  \u2013  ${money(p.revenue)}`));
    }
    doc.moveDown(1);

    doc.fontSize(13).fillColor("#000").text("Payment methods");
    doc.fontSize(10).fillColor("#333");
    if (payMix.length === 0) {
      doc.text("No payments recorded in this period.");
    } else {
      payMix.forEach((p) =>
        doc.text(`${String(p.payment_method).replace("_", " ")}  \u2013  ${money(p.revenue)}  (${p.count})`));
    }

    doc.end();
  });

  res.status(201).json({
    filename,
    url: `${PUBLIC_URL}/reports/${filename}`,
    period,
    range: { start: startStr, end: endStr },
    revenue: totals.revenue,
    sale_count: totals.sale_count,
  });
}

export async function dashboard(req, res) {
  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM products) AS products,
       (SELECT COUNT(*) FROM customers) AS customers,
       (SELECT COUNT(*) FROM vendors) AS vendors,
       (SELECT COUNT(*) FROM orders WHERE status NOT IN ('completed','cancelled')) AS open_orders,
       (SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id
         WHERE i.quantity <= p.reorder_level) AS low_stock_items`
  );
  const [[revenue]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN DATE(sale_date) = CURDATE() THEN amount END), 0) AS today,
       COALESCE(SUM(CASE WHEN sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN amount END), 0) AS this_month,
       COALESCE(SUM(amount), 0) AS all_time,
       COUNT(*) AS sale_count
     FROM sales`
  );
  const [[stock]] = await pool.query(
    `SELECT COALESCE(SUM(i.quantity * p.cost), 0) AS stock_value,
            COALESCE(SUM(i.quantity), 0) AS units_on_hand
     FROM inventory i JOIN products p ON p.id = i.product_id`
  );
  const [lowStock] = await pool.query(
    `SELECT p.id, p.sku, p.name, i.quantity, p.reorder_level
     FROM inventory i JOIN products p ON p.id = i.product_id
     WHERE i.quantity <= p.reorder_level ORDER BY i.quantity ASC LIMIT 10`
  );
  const [recentOrders] = await pool.query(
    `SELECT o.id, o.status, o.total, o.order_date, c.name AS customer_name
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     ORDER BY o.id DESC LIMIT 8`
  );
  res.json({ counts, revenue, stock, low_stock: lowStock, recent_orders: recentOrders });
}

export async function salesOverTime(req, res) {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const [rows] = await pool.query(
    `SELECT DATE(sale_date) AS day, COUNT(*) AS sale_count, SUM(amount) AS revenue
     FROM sales WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(sale_date) ORDER BY day ASC`,
    [days]
  );
  res.json(rows);
}

export async function topProducts(req, res) {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const [rows] = await pool.query(
    `SELECT p.id, p.sku, p.name,
            SUM(oi.quantity) AS units_sold,
            SUM(oi.quantity * oi.unit_price) AS revenue
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled'
     GROUP BY p.id, p.sku, p.name
     ORDER BY revenue DESC LIMIT ?`,
    [limit]
  );
  res.json(rows);
}

export async function stockValuation(req, res) {
  const [rows] = await pool.query(
    `SELECT p.id, p.sku, p.name, p.category, i.quantity, p.cost, p.price,
            (i.quantity * p.cost) AS cost_value,
            (i.quantity * p.price) AS retail_value
     FROM inventory i JOIN products p ON p.id = i.product_id
     ORDER BY cost_value DESC`
  );
  const totals = rows.reduce(
    (acc, r) => ({
      cost_value: acc.cost_value + Number(r.cost_value),
      retail_value: acc.retail_value + Number(r.retail_value),
    }),
    { cost_value: 0, retail_value: 0 }
  );
  res.json({ items: rows, totals });
}