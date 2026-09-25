import { useEffect, useMemo, useState } from "react";
import {
  createAppointment,
  getAppointments,
  getCustomers,
  getMechanicSlots,
  getVehicles,
} from "../api/api";
import styles from "./AppointmentsView.module.css";

const idOf = (record) => String(record?._id ?? record?.id ?? record ?? "");

function toDateKey(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value).slice(0, 10) : date.toLocaleDateString("en-CA");
}

function currentWeek() {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function slotFromAppointment(appointment) {
  if (appointment.slot && typeof appointment.slot === "object") {
    return appointment.slot;
  }
  if (appointment.slotId && typeof appointment.slotId === "object") {
    return appointment.slotId;
  }
  return null;
}

export default function AppointmentsView() {
  const days = useMemo(currentWeek, []);
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSchedule() {
    const fromDate = toDateKey(days[0]);
    const toDate = toDateKey(days[days.length - 1]);
    const [availableSlots, appointments, customerList, vehicleList] = await Promise.all([
      getMechanicSlots(fromDate, toDate),
      getAppointments(),
      getCustomers(),
      getVehicles(),
    ]);

    setSlots(availableSlots);
    setBookings(appointments.map((appointment) => ({ ...appointment, slot: slotFromAppointment(appointment) })).filter((appointment) => appointment.slot));
    setCustomers(customerList);
    setVehicles(vehicleList);
  }

  useEffect(() => {
    let isCurrent = true;

    loadSchedule()
      .catch(() => {
        if (isCurrent) {
          setError("The appointment schedule could not be loaded.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const vehiclesForCustomer = customerId
    ? vehicles.filter((vehicle) => idOf(vehicle.customerId) === customerId)
    : vehicles;
  const timeRows = [...new Set([...slots, ...bookings.map((booking) => booking.slot)].map((slot) => `${slot.startTime}-${slot.endTime}`))].sort();
  const bookedSlotByKey = new Map(bookings.map((booking) => [`${idOf(booking.slot)}-${toDateKey(booking.slot.date)}`, booking]));
  const availableSlotByKey = new Map(slots.map((slot) => [`${slot.startTime}-${slot.endTime}-${toDateKey(slot.date)}`, slot]));
  const customerById = new Map(customers.map((customer) => [idOf(customer), customer]));
  const vehicleById = new Map(vehicles.map((vehicle) => [idOf(vehicle), vehicle]));

  function openModal(slot) {
    setSelectedSlot(slot);
    setCustomerId("");
    setVehicleId("");
    setError("");
  }

  function closeModal() {
    if (!isSaving) {
      setSelectedSlot(null);
    }
  }

  function changeCustomer(nextCustomerId) {
    setCustomerId(nextCustomerId);
    setVehicleId("");
  }

  async function saveAppointment(event) {
    event.preventDefault();
    if (!selectedSlot || !customerId || !vehicleId) {
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const appointment = await createAppointment({
        customerId,
        vehicleId,
        slotId: idOf(selectedSlot),
        notes: "Demo appointment created from the service desk.",
      });
      setBookings((currentBookings) => [...currentBookings, { ...appointment, slot: selectedSlot }]);
      setSlots((currentSlots) => currentSlots.filter((slot) => idOf(slot) !== idOf(selectedSlot)));
      setSelectedSlot(null);
    } catch {
      setError("This slot could not be booked. It may no longer be available.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Schedule</p>
          <h1>Appointments</h1>
          <p className={styles.subtle}>Select an available mechanic slot to create a demo appointment.</p>
        </div>
        <div className={styles.legend}><span><i className={styles.availableKey} />Available</span><span><i className={styles.bookedKey} />Booked</span></div>
      </header>

      {isLoading && <p className={styles.pageState}>Loading mechanic availability...</p>}
      {!isLoading && error && !selectedSlot && <p className={`${styles.pageState} ${styles.errorState}`}>{error}</p>}
      {!isLoading && !error && timeRows.length === 0 && <p className={styles.pageState}>No mechanic slots are available this week.</p>}

      {!isLoading && timeRows.length > 0 && (
        <section className={styles.calendar} aria-label="Mechanic appointment schedule">
          <div className={`${styles.cell} ${styles.corner}`}>Time</div>
          {days.map((day) => <div className={`${styles.cell} ${styles.dayHeader}`} key={toDateKey(day)}><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></div>)}
          {timeRows.map((time) => (
            <div className={styles.calendarRow} key={time}>
              <div className={`${styles.cell} ${styles.timeCell}`}>{time.replace("-", " - ")}</div>
              {days.map((day) => {
                const dateKey = toDateKey(day);
                const availableSlot = availableSlotByKey.get(`${time}-${dateKey}`);
                const booking = [...bookedSlotByKey.values()].find((item) => `${item.slot.startTime}-${item.slot.endTime}` === time && toDateKey(item.slot.date) === dateKey);
                const customer = booking && customerById.get(idOf(booking.customerId));
                const vehicle = booking && vehicleById.get(idOf(booking.vehicleId));

                return (
                  <div className={styles.cell} key={dateKey}>
                    {booking ? (
                      <div className={styles.booked}><strong>{customer?.name ?? "Booked appointment"}</strong><span>{vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehicle details unavailable"}</span></div>
                    ) : availableSlot ? (
                      <button className={styles.available} onClick={() => openModal(availableSlot)} type="button">Available</button>
                    ) : <div className={styles.empty}>-</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}

      {selectedSlot && (
        <div className={styles.modalBackdrop} onMouseDown={closeModal} role="presentation">
          <section aria-labelledby="appointment-title" className={styles.modal} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div><p className={styles.eyebrow}>Demo booking</p><h2 id="appointment-title">Create appointment</h2></div>
              <button aria-label="Close appointment form" className={styles.closeButton} onClick={closeModal} type="button">X</button>
            </div>
            <p className={styles.slotSummary}>{toDateKey(selectedSlot.date)} at {selectedSlot.startTime} - {selectedSlot.endTime} with {selectedSlot.mechanicName}</p>
            <form className={styles.form} onSubmit={saveAppointment}>
              <label>Customer<select onChange={(event) => changeCustomer(event.target.value)} required value={customerId}><option value="">Select customer</option>{customers.map((customer) => <option key={idOf(customer)} value={idOf(customer)}>{customer.name}</option>)}</select></label>
              <label>Vehicle<select disabled={!customerId} onChange={(event) => setVehicleId(event.target.value)} required value={vehicleId}><option value="">Select vehicle</option>{vehiclesForCustomer.map((vehicle) => <option key={idOf(vehicle)} value={idOf(vehicle)}>{vehicle.year} {vehicle.make} {vehicle.model}</option>)}</select></label>
              {error && <p className={styles.formError}>{error}</p>}
              <div className={styles.formActions}><button className={styles.secondaryButton} onClick={closeModal} type="button">Cancel</button><button className={styles.submitButton} disabled={!customerId || !vehicleId || isSaving} type="submit">{isSaving ? "Creating..." : "Create appointment"}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
