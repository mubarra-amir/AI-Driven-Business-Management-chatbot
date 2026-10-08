import { Router } from "express";
import * as customers from "../controllers/customers.js";
const router = Router();
router.get("/", customers.listCustomers);
router.get("/:id", customers.getCustomer);
router.post("/", customers.createCustomer);
router.put("/:id", customers.updateCustomer);
router.delete("/:id", customers.deleteCustomer);
export default router;
