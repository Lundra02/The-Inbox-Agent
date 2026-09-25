import { Router } from "express";
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
} from "../controllers/customerController.js";

const router = Router();

router.get("/", listCustomers);
router.get("/:id", getCustomerById);
router.post("/", createCustomer);
router.patch("/:id", updateCustomer);

export default router;
