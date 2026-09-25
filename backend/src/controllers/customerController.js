import Customer from "../models/Customer.js";
import { handleControllerError } from "./handleControllerError.js";

export async function listCustomers(req, res) {
  try {
    const customers = await Customer.find();
    res.json(customers);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function getCustomerById(req, res) {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function createCustomer(req, res) {
  try {
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateCustomer(req, res) {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    handleControllerError(res, error);
  }
}
