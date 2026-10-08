import { Router } from "express";
import * as orders from "../controllers/orders.js";
const router = Router();
router.get("/", orders.listOrders);
router.get("/sales-summary", orders.salesSummary);
router.get("/:id", orders.getOrder);
router.post("/", orders.createOrder);
router.patch("/:id/status", orders.updateOrderStatus);
export default router;
