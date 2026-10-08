import { Router } from "express";
import * as inventory from "../controllers/inventory.js";
const router = Router();
router.get("/", inventory.listInventory);
router.get("/low-stock", inventory.lowStock);
router.get("/movements", inventory.listMovements);
router.post("/adjust", inventory.adjustStock);
export default router;
