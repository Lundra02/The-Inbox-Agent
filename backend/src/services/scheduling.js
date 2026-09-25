export const shopTimeZone = () => process.env.SHOP_TIMEZONE || "Europe/Tirane";

export function localClock(value, timeZone = shopTimeZone()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function slotDay(slot) {
  return localClock(slot.date)?.date;
}

export function isFutureSlot(slot, now = new Date()) {
  if (!slot || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime || "")) return false;
  const day = slotDay(slot);
  const current = localClock(now);
  return Boolean(day && current && `${day}T${slot.startTime}` > `${current.date}T${current.time}`);
}

export function validDateRange(from, to) {
  return [from, to].every(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) && from <= to;
}
