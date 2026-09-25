import { Link, useParams } from "react-router-dom";
import { workOrders } from "../data/shopData";
import styles from "./Views.module.css";

export default function WorkOrderDetail() {
  const { id } = useParams();
  const workOrder = workOrders[id] ?? workOrders["wo-101"];
  const statusClass = {
    approved: styles.approved,
    draft: styles.draft,
    "in progress": styles.inProgress,
  }[workOrder.status];

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to="/">Back to dashboard</Link>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Work order {workOrder.id.toUpperCase()}</p>
          <h1>{workOrder.vehicle}</h1>
          <p className={styles.subtle}>{workOrder.customer} · {workOrder.mileage}</p>
        </div>
        <span className={`${styles.status} ${statusClass}`}>{workOrder.status}</span>
      </header>

      <div className={styles.detailGrid}>
        <section className={styles.detailSection}>
          <p className={styles.eyebrow}>Service details</p>
          <h2>Requested work</h2>
          <div className={styles.tagList}>{workOrder.issues.map((issue) => <span key={issue}>{issue}</span>)}</div>
          <div className={styles.note}><strong>Customer note</strong><p>{workOrder.notes}</p></div>
        </section>

        <section className={styles.detailSection}>
          <p className={styles.eyebrow}>Assignment</p>
          <h2>Appointment</h2>
          <dl className={styles.definitionList}>
            <div><dt>Scheduled</dt><dd>{workOrder.appointment}</dd></div>
            <div><dt>Mechanic</dt><dd>{workOrder.mechanic}</dd></div>
            <div><dt>Customer</dt><dd>{workOrder.customer}</dd></div>
            <div><dt>Phone</dt><dd>{workOrder.phone}</dd></div>
          </dl>
        </section>
      </div>

      <section className={styles.estimateSection}>
        <div><p className={styles.eyebrow}>Estimate</p><h2>{workOrder.estimate}</h2><span>Parts and labor before tax</span></div>
        <div><p className={styles.eyebrow}>Parts needed</p><ul>{workOrder.parts.map((part) => <li key={part}>{part}</li>)}</ul></div>
      </section>
    </div>
  );
}
