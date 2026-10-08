import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import "express-async-errors";
dotenv.config();

import vendorsRouter from "./routes/vendors.js";
import productsRouter from "./routes/products.js";
import inventoryRouter from "./routes/inventory.js";
import customersRouter from "./routes/customers.js";
import ordersRouter from "./routes/orders.js";
import salesRouter from "./routes/sales.js";
import reportsRouter from "./routes/reports.js";
import { pool } from "./db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(503).json({ status: "degraded", database: err.code || err.message });
  }
});

app.use("/api/vendors", vendorsRouter);
app.use("/api/products", productsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/customers", customersRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/sales", salesRouter);
app.use("/api/reports", reportsRouter);

// The dashboard UI. Served from the same origin as the API, so no CORS dance.
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api", (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

// Central error handler so async controller throws don't crash the process
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ERP backend listening on :${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
});
