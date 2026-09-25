import { Router } from "express";
import {
  createVehicle,
  getVehicleById,
  listVehicles,
  updateVehicle,
} from "../controllers/vehicleController.js";

const router = Router();

router.get("/", listVehicles);
router.get("/:id", getVehicleById);
router.post("/", createVehicle);
router.patch("/:id", updateVehicle);

export default router;
