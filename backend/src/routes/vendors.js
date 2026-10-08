import { Router } from "express";
import * as vendors from "../controllers/vendors.js";
const router = Router();
router.get("/", vendors.listVendors);
router.get("/:id", vendors.getVendor);
router.post("/", vendors.createVendor);
router.put("/:id", vendors.updateVendor);
router.delete("/:id", vendors.deleteVendor);
export default router;
