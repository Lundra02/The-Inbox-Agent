import { Router } from "express";
import {
  checkSchedule,
  createToolAppointment,
  createToolWorkOrder,
  estimateRepair,
  getVehicleHistory,
  lookupVehicle,
  searchParts,
} from "../controllers/agentTools.js";

const router = Router();

router.get("/lookup-vehicle", lookupVehicle);
router.get("/vehicle-history/:vehicleId", getVehicleHistory);
router.get("/search-parts", searchParts);
router.post("/estimate-repair", estimateRepair);
router.get("/check-schedule", checkSchedule);
router.post("/create-appointment", createToolAppointment);
router.post("/create-workorder", createToolWorkOrder);

export default router;
