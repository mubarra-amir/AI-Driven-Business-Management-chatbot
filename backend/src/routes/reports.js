import { Router } from "express";
import * as reports from "../controllers/reports.js";
const router = Router();
router.get("/dashboard", reports.dashboard);
router.get("/sales-over-time", reports.salesOverTime);
router.get("/top-products", reports.topProducts);
router.get("/stock-valuation", reports.stockValuation);
router.post("/sales-report", reports.generateSalesReport);
export default router;