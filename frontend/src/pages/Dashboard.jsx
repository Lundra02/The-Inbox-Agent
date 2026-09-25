import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAppointments, getMechanicSlots, getVehicles, getWorkOrders } from "../api/api";
import WorkOrderCard from "../components/WorkOrderCard";
import styles from "./Views.module.css";

const idOf = (record) => String(record?._id ?? record?.id ?? record ?? "");

export default function Dashboard() {
  const [data, setData] = useState({ appointments: [], slots: [], vehicles: [], workOrders: [] });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function loadDashboard() {
      try {
        const [workOrders, appointments, vehicles, slots] = await Promise.all([
          getWorkOrders(),
          getAppointments(),
          getVehicles(),
          getMechanicSlots("2020-01-01", "2100-01-01", true),
        ]);

        if (isCurrent) {
          setData({ appointments, slots, vehicles, workOrders });
        }
      } catch {
        if (isCurrent) {
          setError("The service desk could not load its current work orders.");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      isCurrent = false;
    };
  }, []);

  const appointmentsById = new Map(data.appointments.map((appointment) => [idOf(appointment), appointment]));
  const slotsById = new Map(data.slots.map((slot) => [idOf(slot), slot]));
  const vehiclesById = new Map(data.vehicles.map((vehicle) => [idOf(vehicle), vehicle]));
  const openWorkOrders = data.workOrders.filter((workOrder) => workOrder.status !== "done").length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Service desk</p>
          <h1>Work orders</h1>
          <p className={styles.subtle}>Current diagnostics, estimates, and linked appointments.</p>
        </div>
        <Link className={styles.primaryLink} to="/appointments">View schedule</Link>
      </header>

      <section className={styles.stats} aria-label="Work order overview">
        <div><strong>{data.workOrders.length}</strong><span>Total work orders</span></div>
        <div><strong>{openWorkOrders}</strong><span>Open work orders</span></div>
        <div><strong>{data.appointments.length}</strong><span>Linked appointments</span></div>
      </section>

      {isLoading && <p className={styles.pageState}>Loading work orders...</p>}
      {error && <p className={`${styles.pageState} ${styles.errorState}`}>{error}</p>}
      {!isLoading && !error && data.workOrders.length === 0 && <p className={styles.pageState}>No work orders are active right now.</p>}

      {!isLoading && !error && data.workOrders.length > 0 && (
        <section className={styles.workOrderList} aria-label="Work orders">
          {data.workOrders.map((workOrder) => (
            (() => {
              const appointment = appointmentsById.get(idOf(workOrder.appointmentId));
              const slot = slotsById.get(idOf(appointment?.slotId));
              return <WorkOrderCard appointment={appointment && { ...appointment, date: slot?.date, startTime: slot?.startTime, endTime: slot?.endTime }} key={idOf(workOrder)} vehicle={vehiclesById.get(idOf(workOrder.vehicleId))} workOrder={workOrder} />;
            })()
          ))}
        </section>
      )}
    </div>
  );
}
