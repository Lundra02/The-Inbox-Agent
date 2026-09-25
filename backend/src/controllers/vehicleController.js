import Vehicle from "../models/Vehicle.js";
import { handleControllerError } from "./handleControllerError.js";

export async function listVehicles(req, res) {
  try {
    const vehicles = await Vehicle.find();
    res.json(vehicles);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getVehicleById(req, res) {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json(vehicle);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createVehicle(req, res) {
  try {
    const vehicle = await Vehicle.create(req.body);
    res.status(201).json(vehicle);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateVehicle(req, res) {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json(vehicle);
  } catch (error) {
    handleControllerError(res, error);
  }
}
