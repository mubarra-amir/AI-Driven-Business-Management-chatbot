import { Router } from "express";
import * as sales from "../controllers/sales.js";
const router = Router();
router.get("/", sales.listSales);
router.get("/:id", sales.getSale);
router.post("/", sales.recordSale);
router.post("/quick", sales.quickSale);
router.delete("/:id", sales.voidSale);
export default router;
