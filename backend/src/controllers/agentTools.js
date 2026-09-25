import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import LaborRate from "../models/LaborRate.js";
import MechanicSlot from "../models/MechanicSlot.js";
import Part from "../models/Part.js";
import RepairHistory from "../models/RepairHistory.js";
import Vehicle from "../models/Vehicle.js";
import Customer from "../models/Customer.js";
import { isFutureSlot, slotDay, validDateRange, shopTimeZone } from "../services/scheduling.js";
import WorkOrder from "../models/WorkOrder.js";
import { handleControllerError } from "./handleControllerError.js";

const vehicleEngineLookup = {
  "volkswagen:golf 7:2016": ["1.2 TSI", "1.4 TSI", "1.6 TDI", "2.0 TDI", "2.0 TSI"],
  "toyota:corolla:2018": ["1.2 Turbo", "1.8 Hybrid", "2.0 Hybrid"],
  "ford:focus:2015": ["1.0 EcoBoost", "1.5 TDCi", "2.0"],
};

function lookupKey(make, model, year) {
  return `${make.trim().toLowerCase()}:${model.trim().toLowerCase()}:${year}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getIssueKeywords(issueCategory) {
  return issueCategory
    .trim()
    .split(/\s+/)
    .filter((keyword) => keyword.length > 2);
}

function buildPartSearchQuery(issueCategory) {
  const keywords = getIssueKeywords(issueCategory);
  const matches = keywords.map((keyword) => new RegExp(escapeRegex(keyword), "i"));

  return {
    $or: matches.flatMap((match) => [
      { name: match },
      { compatibleModels: match },
    ]),
  };
}

async function findMatchingParts(issueCategory) {
  return Part.find(buildPartSearchQuery(issueCategory)).lean();
}

function requireFields(res, body, fields) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return false;
  }

  return true;
}

function cleanToolResponse(value) {
  if (Array.isArray(value)) {
    return value.map(cleanToolResponse);
  }

  if (
    value instanceof Date ||
    value === null ||
    typeof value !== "object" ||
    value._bsontype ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }

  const document = typeof value.toObject === "function" ? value.toObject() : value;

  return Object.fromEntries(
    Object.entries(document)
      .filter(([key]) => key !== "__v" && key !== "_doc" && !key.startsWith("$"))
      .map(([key, item]) => [key, cleanToolResponse(item)]),
  );
}

export async function lookupVehicle(req, res) {
  try {
    const { make, model, year, customerId } = req.query;

    if (!make || !model || !year) {
      return res.status(400).json({ error: "make, model, and year are required" });
    }

    if (customerId && !mongoose.isValidObjectId(customerId)) return res.status(400).json({ error: "Invalid customerId" });
    const vehicles = await Vehicle.find({
      ...(customerId ? { customerId } : {}),
      make: new RegExp(`^${escapeRegex(make)}$`, "i"),
      model: new RegExp(`^${escapeRegex(model)}$`, "i"),
      year: Number(year),
    })
      .select("engine _id")
      .lean();
    const firstId = vehicles[0]?._id?.toString() ?? null;
    const engines = [...new Set(vehicles.map((vehicle) => vehicle.engine).filter(Boolean))];
    const source = engines.length > 0 ? "vehicles" : "static_lookup";

    res.json(cleanToolResponse({
      vehicleId: firstId,
      make,
      model,
      year: Number(year),
      engineOptions: engines.length > 0 ? engines : vehicleEngineLookup[lookupKey(make, model, year)] || [],
      source,
    }));
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getVehicleHistory(req, res) {
  try {
    const history = await RepairHistory.find({ vehicleId: req.params.vehicleId })
      .sort({ date: -1 })
      .lean();

    res.json(cleanToolResponse(history));
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function searchParts(req, res) {
  try {
    const { issueCategory } = req.query;

    if (!issueCategory?.trim()) {
      return res.status(400).json({ error: "issueCategory is required" });
    }

    res.json(cleanToolResponse(await findMatchingParts(issueCategory)));
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function estimateRepair(req, res) {
  try {
    const { issueCategory, laborTaskType } = req.body;

    if (!requireFields(res, req.body, ["issueCategory", "laborTaskType"])) {
      return;
    }

    const laborRate = await LaborRate.findOne({
      taskType: new RegExp(`^${escapeRegex(laborTaskType)}$`, "i"),
    }).lean();

    if (!laborRate) {
      return res.status(404).json({ error: "Labor rate not found" });
    }

    const parts = await findMatchingParts(issueCategory);
    const laborCost = laborRate.hourlyRate * laborRate.estHours;
    const partPrices = parts.map((part) => part.price).filter(Number.isFinite);
    const minPartPrice = partPrices.length > 0 ? Math.min(...partPrices) : 0;
    const maxPartPrice = partPrices.length > 0 ? Math.max(...partPrices) : 0;

    res.json(cleanToolResponse({
      estimateLow: laborCost + minPartPrice,
      estimateHigh: laborCost + maxPartPrice,
      diagnosticFee: laborCost,
      laborHours: laborRate.estHours,
    }));
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function checkSchedule(req, res) {
  try {
    const { fromDate, includeBooked, toDate } = req.query;

    if (!validDateRange(fromDate, toDate)) {
      return res.status(400).json({ error: "Valid fromDate and toDate (YYYY-MM-DD, in order) are required" });
    }

    const slotFilter = {
      // Stored dates may represent midnight in the shop's zone, not UTC.
      date: { $gte: new Date(Date.parse(fromDate) - 86400000), $lte: new Date(Date.parse(toDate) + 86400000) },
    };

    if (includeBooked !== "true") {
      slotFilter.isAvailable = true;
    }

    const slots = await MechanicSlot.find(slotFilter)
      .sort({ date: 1, startTime: 1 })
      .lean();

    res.json(cleanToolResponse(slots.filter(slot => isFutureSlot(slot) && slotDay(slot) >= fromDate && slotDay(slot) <= toDate)
      .map(slot => ({ ...slot, localDate: slotDay(slot), timeZone: shopTimeZone() }))));
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createToolAppointment(req, res) {
  try {
    const { customerId, vehicleId, slotId, notes } = req.body;

    if (!requireFields(res, req.body, ["customerId", "vehicleId", "slotId"])) {
      return;
    }

    if (![customerId, vehicleId, slotId].every(mongoose.isValidObjectId)) {
      return res.status(400).json({ error: "customerId, vehicleId, and slotId must be valid IDs" });
    }

    const [customer, vehicle, candidate] = await Promise.all([
      Customer.findById(customerId), Vehicle.findOne({ _id: vehicleId, customerId }), MechanicSlot.findById(slotId),
    ]);
    if (!customer?.phone || !/^\+[1-9]\d{7,14}$/.test(customer.phone)) return res.status(400).json({ error: "A valid international customer phone is required" });
    if (!vehicle) return res.status(400).json({ error: "Register this vehicle to the customer before booking" });
    if (!isFutureSlot(candidate)) return res.status(409).json({ error: "Appointment slot is in the past or invalid" });
    const existing = await Appointment.findOne({ customerId, vehicleId, slotId, status: { $ne: "cancelled" } });
    if (existing) return res.json(cleanToolResponse(existing));
    const slot = await MechanicSlot.findOneAndUpdate(
      { _id: slotId, isAvailable: true },
      { isAvailable: false },
      { new: true },
    );

    if (!slot) {
      return res.status(409).json({ error: "Mechanic slot is unavailable" });
    }

    try {
      if (!isFutureSlot(slot)) {
        await MechanicSlot.findByIdAndUpdate(slotId, { isAvailable: true });
        return res.status(409).json({ error: "Appointment slot has already started" });
      }
      const appointment = await Appointment.create({ customerId, vehicleId, slotId, notes });
      res.status(201).json(cleanToolResponse(appointment));
    } catch (error) {
      await MechanicSlot.findByIdAndUpdate(slotId, { isAvailable: true });
      throw error;
    }
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createToolWorkOrder(req, res) {
  try {
    const { appointmentId, vehicleId, issueCategories, estimateLow, estimateHigh, partsNeeded } = req.body;

    if (!requireFields(res, req.body, ["appointmentId", "vehicleId", "issueCategories", "estimateLow", "estimateHigh"])) {
      return;
    }

    const workOrder = await WorkOrder.create({
      appointmentId,
      vehicleId,
      issueCategories,
      estimateLow,
      estimateHigh,
      partsNeeded: partsNeeded || [],
    });

    res.status(201).json(cleanToolResponse(workOrder));
  } catch (error) {
    handleControllerError(res, error);
  }
}
