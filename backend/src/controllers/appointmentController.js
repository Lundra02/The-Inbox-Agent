import Appointment from "../models/Appointment.js";
import { handleControllerError } from "./handleControllerError.js";
import { createToolAppointment } from "./agentTools.js";

export async function listAppointments(req, res) {
  try {
    const appointments = await Appointment.find();
    res.json(appointments);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getAppointmentById(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    res.json(appointment);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createAppointment(req, res) {
  return createToolAppointment(req, res);
}

export async function updateAppointment(req, res) {
  try {
    if (["slotId", "vehicleId", "customerId"].some(key => key in req.body)) {
      return res.status(400).json({ error: "Appointment identity and slot cannot be changed through this endpoint" });
    }
    const appointment = await Appointment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    res.json(appointment);
  } catch (error) {
    handleControllerError(res, error);
  }
}
