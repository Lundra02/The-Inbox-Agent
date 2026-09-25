import { Router } from "express";
import {
  createWorkOrder,
  getWorkOrderById,
  listWorkOrders,
  updateWorkOrder,
} from "../controllers/workOrderController.js";

const router = Router();

router.get("/", listWorkOrders);
router.get("/:id", getWorkOrderById);
router.post("/", createWorkOrder);
router.patch("/:id", updateWorkOrder);

export default router;
