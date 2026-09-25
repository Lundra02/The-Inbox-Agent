import "dotenv/config";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import Appointment from "../models/Appointment.js";
import Customer from "../models/Customer.js";
import LaborRate from "../models/LaborRate.js";
import MechanicSlot from "../models/MechanicSlot.js";
import Part from "../models/Part.js";
import RepairHistory from "../models/RepairHistory.js";
import Vehicle from "../models/Vehicle.js";
import WorkOrder from "../models/WorkOrder.js";

function getNextWeekdays(count) {
  const weekdays = [];
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  while (weekdays.length < count) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();

    if (day !== 0 && day !== 6) {
      weekdays.push(new Date(date));
    }
  }

  return weekdays;
}

function createMechanicSlots() {
  const slotTemplates = [
    { startTime: "08:00", endTime: "10:00", mechanicName: "Arben D." },
    { startTime: "10:00", endTime: "12:00", mechanicName: "Dritan M." },
    { startTime: "13:00", endTime: "15:00", mechanicName: "Elira K." },
    { startTime: "15:00", endTime: "17:00", mechanicName: "Sara L." },
  ];

  return getNextWeekdays(5).flatMap((date) =>
    slotTemplates.map((slot) => ({
      date,
      ...slot,
      isAvailable: true,
    })),
  );
}

export async function seed() {
  await connectDB();

  try {
    await Promise.all([
      Appointment.deleteMany({}),
      WorkOrder.deleteMany({}),
      RepairHistory.deleteMany({}),
      Vehicle.deleteMany({}),
      Customer.deleteMany({}),
      MechanicSlot.deleteMany({}),
      LaborRate.deleteMany({}),
      Part.deleteMany({}),
    ]);

    const customers = await Customer.insertMany([
      {
        name: "Ardit Hoxha",
        phone: "+355691111111",
        email: "ardit.hoxha@example.com",
      },
      {
        name: "Mira Kola",
        phone: "+355692222222",
        email: "mira.kola@example.com",
      },
      {
        name: "Ben Carter",
        phone: "+15555550123",
        email: "ben.carter@example.com",
      },
    ]);

    const vehicles = await Vehicle.insertMany([
      {
        customerId: customers[0]._id,
        make: "Volkswagen",
        model: "Golf 7",
        year: 2016,
        engine: "1.6 TDI",
        mileage: 186000,
      },
      {
        customerId: customers[1]._id,
        make: "Toyota",
        model: "Corolla",
        year: 2018,
        engine: "1.8 Hybrid",
        mileage: 92000,
      },
      {
        customerId: customers[2]._id,
        make: "Ford",
        model: "Focus",
        year: 2015,
        engine: "2.0",
        mileage: 134500,
      },
    ]);

    await Promise.all(
      customers.map((customer, index) =>
        Customer.findByIdAndUpdate(customer._id, {
          vehicleIds: [vehicles[index]._id],
        }),
      ),
    );

    await RepairHistory.insertMany([
      {
        vehicleId: vehicles[0]._id,
        date: new Date("2025-02-14"),
        description: "Replaced front brake pads and inspected rotors.",
        resolvedIssue: "Brake squeal under light braking",
        cost: 180,
      },
      {
        vehicleId: vehicles[0]._id,
        date: new Date("2025-10-03"),
        description: "Diagnosed engine vibration and replaced worn engine mount.",
        resolvedIssue: "Cabin vibration at idle",
        cost: 260,
      },
      {
        vehicleId: vehicles[1]._id,
        date: new Date("2025-04-19"),
        description: "Oil and filter service with general inspection.",
        resolvedIssue: "Routine maintenance",
        cost: 95,
      },
      {
        vehicleId: vehicles[1]._id,
        date: new Date("2026-01-22"),
        description: "Replaced spark plugs and cleaned throttle body.",
        resolvedIssue: "Rough cold start",
        cost: 210,
      },
      {
        vehicleId: vehicles[2]._id,
        date: new Date("2025-07-11"),
        description: "Replaced outer CV joint and axle boot.",
        resolvedIssue: "Clicking noise while turning",
        cost: 240,
      },
      {
        vehicleId: vehicles[2]._id,
        date: new Date("2026-03-08"),
        description: "Injector cleaning and fuel system inspection.",
        resolvedIssue: "Hesitation under acceleration",
        cost: 170,
      },
    ]);

    await Part.insertMany([
      { name: "Engine Mount", price: 120, compatibleModels: ["Golf 7", "Focus"], stockQty: 6 },
      { name: "CV Joint Kit", price: 95, compatibleModels: ["Golf 7", "Corolla", "Focus"], stockQty: 8 },
      { name: "Diesel Injector", price: 280, compatibleModels: ["Golf 7"], stockQty: 4 },
      { name: "Spark Plug Set", price: 45, compatibleModels: ["Corolla", "Focus"], stockQty: 15 },
      { name: "Front Brake Pads", price: 65, compatibleModels: ["Golf 7", "Corolla", "Focus"], stockQty: 12 },
      { name: "Rear Brake Pads", price: 58, compatibleModels: ["Golf 7", "Corolla", "Focus"], stockQty: 10 },
      { name: "Oil Filter", price: 18, compatibleModels: ["Golf 7", "Corolla", "Focus"], stockQty: 25 },
      { name: "Air Filter", price: 22, compatibleModels: ["Golf 7", "Corolla", "Focus"], stockQty: 20 },
      { name: "Timing Belt Kit", price: 180, compatibleModels: ["Golf 7", "Focus"], stockQty: 5 },
      { name: "Glow Plug Set", price: 70, compatibleModels: ["Golf 7"], stockQty: 7 },
    ]);

    await LaborRate.insertMany([
      { taskType: "Diagnostics", hourlyRate: 60, estHours: 1 },
      { taskType: "Brake Service", hourlyRate: 65, estHours: 1.5 },
      { taskType: "Suspension Repair", hourlyRate: 70, estHours: 2 },
      { taskType: "Engine Repair", hourlyRate: 85, estHours: 3 },
      { taskType: "Routine Maintenance", hourlyRate: 55, estHours: 1 },
    ]);

    await MechanicSlot.insertMany(createMechanicSlots());

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Database seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed();
}
