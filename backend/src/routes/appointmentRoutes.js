import { Router } from "express";
import {
  createAppointment,
  getAppointmentById,
  listAppointments,
  updateAppointment,
} from "../controllers/appointmentController.js";

const router = Router();

router.get("/", listAppointments);
router.get("/:id", getAppointmentById);
router.post("/", createAppointment);
router.patch("/:id", updateAppointment);

export default router;
