import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || "http://localhost:5000",
});

export async function getAppointments() {
  const response = await api.get("/api/appointments");
  return response.data;
}

export async function getCustomers() {
  const response = await api.get("/api/customers");
  return response.data;
}

export async function getVehicles() {
  const response = await api.get("/api/vehicles");
  return response.data;
}

export async function getVehicleHistory(vehicleId) {
  const response = await api.get(`/api/tools/vehicle-history/${vehicleId}`);
  return response.data;
}

export async function getWorkOrder(id) {
  const response = await api.get(`/api/workorders/${id}`);
  return response.data;
}

export async function getWorkOrders() {
  const response = await api.get("/api/workorders");
  return response.data;
}

export async function updateWorkOrder(id, payload) {
  const response = await api.patch(`/api/workorders/${id}`, payload);
  return response.data;
}

export async function getMechanicSlots(fromDate, toDate, includeBooked = false) {
  const response = await api.get("/api/tools/check-schedule", {
    params: { fromDate, includeBooked, toDate },
  });
  return response.data;
}

export async function createAppointment(payload) {
  const response = await api.post("/api/tools/create-appointment", payload);
  return response.data;
}

export default api;
