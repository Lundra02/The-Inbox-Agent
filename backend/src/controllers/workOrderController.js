import WorkOrder from "../models/WorkOrder.js";
import { handleControllerError } from "./handleControllerError.js";

export async function listWorkOrders(req, res) {
  try {
    const workOrders = await WorkOrder.find();
    res.json(workOrders);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getWorkOrderById(req, res) {
  try {
    const workOrder = await WorkOrder.findById(req.params.id);

    if (!workOrder) {
      return res.status(404).json({ error: "Work order not found" });
    }

    res.json(workOrder);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createWorkOrder(req, res) {
  try {
    const workOrder = await WorkOrder.create(req.body);
    res.status(201).json(workOrder);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateWorkOrder(req, res) {
  try {
    const workOrder = await WorkOrder.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!workOrder) {
      return res.status(404).json({ error: "Work order not found" });
    }

    res.json(workOrder);
  } catch (error) {
    handleControllerError(res, error);
  }
}
