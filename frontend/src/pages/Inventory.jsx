import { useEffect, useState } from "react";
import api from "../api/api";
import styles from "./Inbox.module.css";

function StockRow({ item, refresh }) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [incoming, setIncoming] = useState(item.incomingQuantity);
  const [arrival, setArrival] = useState(item.expectedArrival || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setQuantity(item.quantity); setIncoming(item.incomingQuantity); setArrival(item.expectedArrival || ""); }, [item.quantity, item.incomingQuantity, item.expectedArrival]);
  async function save(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { await api.patch(`/api/inventory/${encodeURIComponent(item.sku)}`, { quantity: Number(quantity), incomingQuantity: Number(incoming), expectedArrival: arrival }); await refresh(); }
    catch { setError("Could not save stock. Please retry."); }
    finally { setBusy(false); }
  }
  return <form className={styles.stockRow} onSubmit={save}>
    <div><strong>{item.name}</strong><p>{item.quantity > 0 ? "In stock" : item.incomingQuantity > 0 ? "Coming soon" : "Out of stock"} · €{item.priceEUR}</p><small>{item.sku}</small></div>
    <label>Available units<input type="number" min="0" max="1000000" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
    <label>Incoming units<input type="number" min="0" max="1000000" required value={incoming} onChange={e => setIncoming(e.target.value)} /></label>
    <label>Expected arrival<input type="date" value={arrival} onChange={e => setArrival(e.target.value)} /></label>
    <button disabled={busy}>{busy ? "Saving…" : "Save stock"}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function Inventory() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  async function refresh() {
    try { const response = await api.get("/api/inventory"); setData(response.data); setError(""); }
    catch { setError("Live stock unavailable. Displayed values may be outdated."); }
  }
  useEffect(() => { refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, []);
  const items = data?.items || [];
  return <section className={styles.panel}>
    <div className={styles.sectionHeading}><h2>Live stock</h2><button onClick={refresh}>Refresh stock</button></div>
    <p className={styles.muted}>Editable demo inventory stored in the shop database. Refreshes every 10 seconds; the agent checks it before each product answer. No supplier feed is connected.</p>
    <p>{items.filter(i => i.quantity > 0).length} in stock · {items.filter(i => i.quantity === 0).length} unavailable · {items.filter(i => i.incomingQuantity > 0).length} with incoming deliveries</p>
    <select aria-label="Filter stock" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All items</option><option value="in_stock">In stock</option><option value="missing">Out of stock</option><option value="incoming">Incoming</option></select>
    {error && <p role="alert">{error}</p>}
    {data && <p className={styles.muted}>Last checked: {new Date(data.checkedAt).toLocaleTimeString()}</p>}
    {items.filter(i => filter === "all" || (filter === "in_stock" ? i.quantity > 0 : filter === "missing" ? i.quantity === 0 : i.incomingQuantity > 0)).map(item => <StockRow key={item.sku} item={item} refresh={refresh} />)}
  </section>;
}
