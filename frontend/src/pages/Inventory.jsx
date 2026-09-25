import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import styles from "./Inventory.module.css";
import { filterAndSortItems, statusLabel } from "./inventoryLogic";

const emptyForm = { sku: "", name: "", priceEUR: "", quantity: 0, incomingQuantity: 0, expectedArrival: "", installmentsEligible: false, lowStockThreshold: 3 };

export default function Inventory() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingSku, setEditingSku] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try { const response = await api.get("/api/inventory"); setData(response.data); setError(""); }
    catch { setError("Live stock is unavailable. Please retry."); }
  }
  useEffect(() => { refresh(); }, []);

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm(previous => ({ ...previous, [name]: type === "checkbox" ? checked : value }));
  }

  function beginEdit(item) {
    setEditingSku(item.sku);
    setForm({ ...item, priceEUR: item.priceEUR, quantity: item.quantity, incomingQuantity: item.incomingQuantity, expectedArrival: item.expectedArrival || "" });
    setMessage(""); setError("");
  }

  function resetForm() { setEditingSku(null); setForm(emptyForm); }

  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    const payload = { name: form.name, priceEUR: Number(form.priceEUR), quantity: Number(form.quantity), incomingQuantity: Number(form.incomingQuantity), expectedArrival: form.expectedArrival, installmentsEligible: form.installmentsEligible, lowStockThreshold: Number(form.lowStockThreshold) };
    try {
      if (editingSku) await api.patch(`/api/inventory/${encodeURIComponent(editingSku)}`, { ...payload, version: form.__v });
      else await api.post("/api/inventory", { sku: form.sku, ...payload });
      resetForm(); await refresh(); setMessage(editingSku ? "Stock updated successfully." : "Stock item created successfully.");
    } catch (requestError) { setError(requestError.response?.data?.error || "Could not save stock item."); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.name} (${item.sku})? This cannot be undone.`)) return;
    setBusy(true); setMessage(""); setError("");
    try { await api.delete(`/api/inventory/${encodeURIComponent(item.sku)}`); await refresh(); setMessage("Stock item deleted successfully."); }
    catch (requestError) { setError(requestError.response?.data?.error || "Could not delete stock item."); }
    finally { setBusy(false); }
  }

  const items = useMemo(() => filterAndSortItems(data?.items || [], query, filter, sort), [data, filter, query, sort]);

  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>OPERATIONS · CATALOG</p><h1>Live stock</h1><p>Manage the quantities and availability the agent reports to customers.</p></div><button className={styles.refresh} onClick={refresh} disabled={busy}>Refresh stock</button></header>
    <section className={styles.panel}>
      <div className={styles.sectionHeading}><h2>{editingSku ? "Edit stock item" : "Add stock item"}</h2>{editingSku && <button className={styles.secondary} onClick={resetForm}>Cancel</button>}</div>
      <form className={styles.form} onSubmit={save}>
        <label>SKU<input name="sku" value={form.sku} onChange={updateField} pattern="[a-z0-9][a-z0-9-]{1,59}" disabled={Boolean(editingSku)} required /></label>
        <label>Product name<input name="name" value={form.name} onChange={updateField} maxLength={100} required /></label>
        <label>Price EUR<input name="priceEUR" type="number" min="0" step="0.01" value={form.priceEUR} onChange={updateField} required /></label>
        <label>Available<input name="quantity" type="number" min="0" max="1000000" step="1" value={form.quantity} onChange={updateField} required /></label>
        <label>Incoming<input name="incomingQuantity" type="number" min="0" max="1000000" step="1" value={form.incomingQuantity} onChange={updateField} required /></label>
        <label>Expected arrival<input name="expectedArrival" type="date" value={form.expectedArrival} onChange={updateField} /></label>
        <label>Low-stock alert<input name="lowStockThreshold" type="number" min="0" max="1000000" step="1" value={form.lowStockThreshold} onChange={updateField} required /></label>
        <label className={styles.checkbox}><input name="installmentsEligible" type="checkbox" checked={form.installmentsEligible} onChange={updateField} /> Installments eligible</label>
        <button disabled={busy}>{busy ? "Saving..." : editingSku ? "Save changes" : "Create item"}</button>
      </form>
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionHeading}><h2>Inventory <small>({items.length})</small></h2><div className={styles.controls}><input aria-label="Search stock" placeholder="Search SKU or product" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Filter stock" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="in_stock">In stock</option><option value="incoming">Incoming</option><option value="out_of_stock">Out of stock</option></select><select aria-label="Sort stock" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Sort: name</option><option value="quantity">Sort: quantity</option><option value="status">Sort: status</option></select></div></div>
      {message && <p className={styles.success} role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.table} role="table"><div className={styles.tableHeader} role="row"><span>SKU</span><span>Product</span><span>Available</span><span>Incoming</span><span>Arrival</span><span>Status</span><span>Actions</span></div>
        {items.map(item => <div className={styles.row} role="row" key={item.sku}><span>{item.sku}</span><strong>{item.name}</strong><span>{item.quantity}</span><span>{item.incomingQuantity}</span><span>{item.expectedArrival || "Not confirmed"}</span><span className={item.quantity > 0 ? styles.inStock : item.incomingQuantity > 0 ? styles.comingSoon : styles.outOfStock}>{statusLabel(item)}</span><span className={styles.actions}><button className={styles.secondary} onClick={() => beginEdit(item)} disabled={busy}>Edit</button><button className={styles.danger} onClick={() => remove(item)} disabled={busy}>Delete</button></span></div>)}
        {!items.length && <p className={styles.empty}>No stock items match your filters.</p>}
      </div>
    </section>
  </main>;
}
