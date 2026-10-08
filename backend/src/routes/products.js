import { Router } from "express";
import * as products from "../controllers/products.js";
const router = Router();
router.get("/", products.listProducts);
router.get("/:id", products.getProduct);
router.post("/", products.createProduct);
router.put("/:id", products.updateProduct);
router.delete("/:id", products.deleteProduct);
export default router;
