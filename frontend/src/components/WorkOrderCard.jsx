import { Link } from "react-router-dom";
import styles from "./WorkOrderCard.module.css";

const statusLabels = {
  approved: "Approved",
  done: "Done",
  draft: "Draft",
  in_progress: "In progress",
};

function formatAppointment(appointment) {
  if (!appointment) {
    return "No appointment linked";
  }

  const date = appointment.date ?? appointment.scheduledDate ?? appointment.scheduledAt;
  const time = appointment.time ?? appointment.startTime;

  if (date && time) {
    return `${new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} ${time}`;
  }

  if (date) {
    return new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  return "Linked, time unavailable";
}

function formatEstimate(low, high) {
  if (low == null && high == null) {
    return "Estimate pending";
  }
  if (low === high || high == null) {
    return `$${low}`;
  }
  if (low == null) {
    return `$${high}`;
  }
  return `$${low}-$${high}`;
}

export default function WorkOrderCard({ workOrder, vehicle, appointment }) {
  const vehicleName = vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year}` : "Vehicle details unavailable";
  const complaint = appointment?.notes ?? workOrder.notes ?? "No customer complaint recorded.";
  const inspectionAreas = workOrder.issueCategories ?? [];
  const information = [
    vehicle?.mileage != null && `Mileage ${Number(vehicle.mileage).toLocaleString()} km`,
    vehicle?.engine && `Engine ${vehicle.engine}`,
    workOrder.warningLight != null && `Warning light: ${workOrder.warningLight ? "Yes" : "No"}`,
  ].filter(Boolean);

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.vehicleLabel}>Vehicle</p>
          <h2>{vehicleName}</h2>
        </div>
        <span className={`${styles.status} ${styles[workOrder.status] ?? styles.draft}`}>
          {statusLabels[workOrder.status] ?? workOrder.status}
        </span>
      </div>

      <div className={styles.row}>
        <span>Customer complaint</span>
        <p>{complaint}</p>
      </div>

      {information.length > 0 && (
        <div className={styles.row}>
          <span>Information collected</span>
          <p>{information.join(" · ")}</p>
        </div>
      )}

      <div className={styles.row}>
        <span>Possible inspection areas</span>
        {inspectionAreas.length > 0 ? (
          <ol className={styles.areaList}>
            {inspectionAreas.map((area) => <li key={area}>{area}</li>)}
          </ol>
        ) : <p>Not yet identified.</p>}
      </div>

      <div className={styles.cardFooter}>
        <div><span>Estimate</span><strong>{formatEstimate(workOrder.estimateLow, workOrder.estimateHigh)}</strong></div>
        <div><span>Appointment</span><strong>{formatAppointment(appointment)}</strong></div>
        <Link to={`/workorders/${workOrder._id ?? workOrder.id}`}>Open work order</Link>
      </div>
    </article>
  );
}
