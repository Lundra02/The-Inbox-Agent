import { Link } from "react-router-dom";
import { appointments, mechanicSlots } from "../data/shopData";
import styles from "./Views.module.css";

const days = [
  { key: "Mon", label: "Mon", date: "30" },
  { key: "Tue", label: "Tue", date: "31" },
  { key: "Wed", label: "Wed", date: "1" },
  { key: "Thu", label: "Thu", date: "2" },
  { key: "Fri", label: "Fri", date: "3" },
];

export default function Appointments() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Schedule</p>
          <h1>Appointments</h1>
          <p className={styles.subtle}>Mechanic availability for the week of March 30.</p>
        </div>
        <div className={styles.legend}><span><i className={styles.availableKey} />Available</span><span><i className={styles.bookedKey} />Booked</span></div>
      </header>

      <section className={styles.calendar} aria-label="Mechanic availability calendar">
        <div className={`${styles.calendarCell} ${styles.calendarCorner}`}>Mechanic</div>
        {days.map((day) => <div className={`${styles.calendarCell} ${styles.dayHeader}`} key={day.key}><span>{day.label}</span><strong>{day.date}</strong></div>)}
        {mechanicSlots.map((slot) => (
          <div className={styles.calendarRow} key={slot.mechanic}>
            <div className={`${styles.calendarCell} ${styles.mechanic}`}><strong>{slot.mechanic}</strong><span>{slot.time}</span></div>
            {days.map((day) => {
              const appointment = appointments.find((item) => item.mechanic === slot.mechanic && item.day === day.key);
              return (
                <div className={styles.calendarCell} key={day.key}>
                  {appointment ? <Link className={styles.bookedSlot} to={`/workorders/${appointment.workOrderId}`}><strong>{appointment.customer}</strong><span>{appointment.service}</span></Link> : <div className={styles.availableSlot}>Available</div>}
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <section className={styles.scheduleSummary}>
        <div><p className={styles.eyebrow}>This week</p><h2>8 of 20 slots booked</h2></div>
        <p>Availability updates as appointments are confirmed or rescheduled.</p>
      </section>
    </div>
  );
}
