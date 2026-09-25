import { useEffect, useState } from "react";
import api from "../api/api";
import styles from "./Inbox.module.css";

import Inventory from "./Inventory";

const labels = { order_status: "Order status", return_request: "Return request", complaint_escalation: "Complaint", third_party_info_request: "Privacy request", product_inquiry: "Product inquiry", other: "Clarification" };

export default function Inbox() {
  const [cases, setCases] = useState([]);
  const [challenge, setChallenge] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runProgress, setRunProgress] = useState("");
  const [conversationId, setConversationId] = useState(() => sessionStorage.getItem("inboxConversation") || crypto.randomUUID());
  const [assignedTo, setAssignedTo] = useState("");
  const [analytics, setAnalytics] = useState(null);
  useEffect(() => { sessionStorage.setItem("inboxConversation", conversationId); }, [conversationId]);

  async function refresh() {
    const { data } = await api.get("/api/inbox/cases");
    setCases(data);
    const metrics = await api.get("/api/inbox/analytics");
    setAnalytics(metrics.data);
  }
  useEffect(() => {
    Promise.all([api.get("/api/inbox/challenge"), api.get("/api/inbox/catalog"), api.get("/api/inbox/cases")])
      .then(([tests, data, list]) => { setChallenge(tests.data); setCatalog(data.data); setCases(list.data); })
      .catch(() => setError("Start the backend, Python agent and MongoDB to load the inbox."));
    const timer = setInterval(() => { refresh().catch(() => {}); }, 10000);
    api.get("/api/inbox/analytics").then(r => setAnalytics(r.data)).catch(() => {});
    return () => clearInterval(timer);
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/api/inbox/messages", { message, conversationId }, { timeout: 25000 });
      setSelected(data); setMessage(""); await refresh();
    } catch (e) { setError(e.response?.data?.error || "Message could not be processed. Please check the services."); }
    finally { setBusy(false); }
  }
  async function runChallenge() {
    setBusy(true); setError("");
    try {
      for (let index = 0; index < challenge.length; index++) {
        setRunProgress(`Running case ${index + 1} of ${challenge.length}`);
        const { data } = await api.post("/api/inbox/messages", { message: challenge[index], conversationId: crypto.randomUUID() }, { timeout: 25000 });
        setSelected(data); await refresh();
      }
      setRunProgress("All five cases processed. Review their decisions below.");
    } catch (e) { setError(e.response?.data?.error || "The test run stopped. Completed cases are saved."); setRunProgress(""); }
    finally { setBusy(false); }
  }
  async function resolve(item) {
    try {
      const { data } = await api.patch(`/api/inbox/cases/${item._id}/resolve`);
      setSelected(data); await refresh();
    } catch { setError("Could not resolve this case. Refresh and try again."); }
  }
  async function assign(item) {
    try {
      const { data } = await api.patch(`/api/inbox/cases/${item._id}/assign`, { assignedTo });
      setSelected(data); setAssignedTo(""); await refresh();
    } catch (e) { setError(e.response?.data?.error || "Could not assign conversation"); }
  }
  const visible = cases.filter(item => filter === "all" || item.status === filter);
  const active = selected && (cases.find(item => item._id === selected._id) || selected);

  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>ELECTRONICS SUPPORT · PRISHTINA</p><h1>The Inbox Agent</h1><p>Clear answers. Safer decisions. A human when it matters.</p></div><span className={styles.demo}>Mock shop data</span></header>
    <section className={styles.policies} aria-label="Shop policies">
      <div><strong>2–4 working days</strong><span>Standard delivery</span></div>
      <div><strong>30-day returns</strong><span>Unopened products only</span></div>
      <div><strong>Privacy first</strong><span>Sensitive requests go to staff</span></div>
    </section>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {analytics && <section className={styles.policies} aria-label="Inbox analytics">
      <div><strong>{analytics.total ? Math.round(analytics.automated / analytics.total * 100) : 0}% automatic</strong><span>{analytics.total} stored messages · {analytics.escalated} escalated or held</span></div>
      <div><strong>{Math.round(analytics.averageProcessingMs || 0)} ms</strong><span>Mean agent processing · {analytics.waiting} awaiting staff</span></div>
      <div><strong>{analytics.estimatedMinutesSaved} minutes</strong><span>Estimated savings at 2.5 min per automatic answer; includes demo cases</span></div>
    </section>}
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <h2>Try a customer message</h2><p className={styles.muted}>Write in Albanian or English. Demo replies appear here; they are not sent to a real customer.</p>
        <div className={styles.sectionHeading}><small>Conversation {conversationId.slice(0, 8)}</small><button className={styles.secondary} disabled={busy} onClick={() => { setConversationId(crypto.randomUUID()); setSelected(null); setMessage(""); }}>New conversation</button></div>
        <form onSubmit={submit}><label htmlFor="customer-message">Customer message</label><textarea id="customer-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={10000} rows={5} placeholder="How can we help? / Si mund t'ju ndihmojmë?" required />
          <button disabled={busy || !message.trim()}>{busy ? "Processing…" : "Process message"}</button>
        </form>
        <div className={styles.sectionHeading}><h3>Five challenge cases</h3><button className={styles.secondary} disabled={busy || challenge.length !== 5} onClick={runChallenge}>Run all five</button></div>
        <div className={styles.samples}>{challenge.map((text, i) => <button className={styles.sample} disabled={busy} key={text} onClick={() => setMessage(text)}><span>{String(i + 1).padStart(2, "0")}</span>{text}</button>)}</div>
        <p role="status" className={styles.muted}>{runProgress}</p>
      </section>
      <section className={styles.panel} aria-live="polite">
        <h2>Agent decision</h2>
        {!active ? <div className={styles.empty}>Select a saved case or process a message to see the reply and decision.</div> : <>
          <div className={styles.tags}><span>{active.language === "sq" ? "Albanian" : "English"}</span><span>{labels[active.intent] || active.intent}</span><span className={active.decision === "escalate" ? styles.human : styles.auto}>{active.decision === "escalate" ? "Human escalation" : "Automatic answer"}</span></div>
          <p className={styles.original}>{active.message}</p><h3>Customer reply</h3><p className={styles.reply}>{active.replySuppressed ? "No automatic reply: this conversation is paused for human review." : active.customerReply}</p>
          {active.internalNote && <div className={styles.note}><h3>Internal staff note</h3><p>{active.internalNote}</p><small>Never sent to the customer.</small></div>}
          <p className={styles.muted}>{active.replyEngine === "generated" ? "AI-written reply · policy checked" : active.replyEngine === "strict_policy" ? "Strict privacy response" : active.replyEngine === "fallback" ? "Safe reply fallback" : active.engine === "hybrid" ? "AI classification + business rules" : "Policy rules"} · {active.elapsedMs} ms · {active.channel}</p>
          {active.stockCheck && <p className={styles.muted}>{active.stockCheck.available ? `Stock checked: ${new Date(active.stockCheck.checkedAt).toLocaleString()}` : "Stock lookup unavailable; availability not confirmed."}</p>}
          {active.fallbackReason && <p className={styles.muted}>{active.fallbackReason}</p>}
          {active.conversationKey?.startsWith("demo:") && <button className={styles.secondary} disabled={busy} onClick={() => setConversationId(active.conversationKey.slice(5))}>Continue this conversation</button>}
          {active.status === "needs_human" && <>
            <p className={styles.muted}>Assigned to: {active.assignedTo || "Unassigned"}. Automatic replies are paused for this conversation.</p>
            <label htmlFor="staff-name">Staff member</label><input id="staff-name" value={assignedTo} maxLength={80} onChange={e => setAssignedTo(e.target.value)} placeholder="Staff name" />
            <button disabled={!assignedTo.trim()} onClick={() => assign(active)}>Assign to staff</button>
            <button onClick={() => resolve(active)}>Resolve conversation & resume agent</button>
          </>}
          {active.status === "resolved" && <p>Reviewed and resolved by staff.</p>}
        </>}
      </section>
    </div>
    <section className={styles.panel}><div className={styles.sectionHeading}><h2>Support inbox <small>({cases.length})</small></h2><select aria-label="Filter cases" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All cases</option><option value="needs_human">Needs a human</option><option value="answered">Answered</option><option value="resolved">Resolved</option></select></div>
      {visible.length === 0 ? <p className={styles.muted}>No cases in this view yet.</p> : <div className={styles.caseList}>{visible.map(item => <button key={item._id} className={styles.case} onClick={() => setSelected(item)}><span className={item.status === "needs_human" ? styles.human : styles.auto}>{item.status.replaceAll("_", " ")}</span><strong>{item.message}</strong><small>{item.channel} · {item.language.toUpperCase()}</small></button>)}</div>}
    </section>
    <Inventory />
    {catalog && <section className={styles.panel}><h2>Mock shop reference</h2><p className={styles.muted}>Fictional records for the hackathon. Private addresses and phone numbers are excluded.</p><div className={styles.reference}>
      <div><h3>Payment policy</h3><p>Demo installments: 6 months, 0% interest, eligible purchases from ?300. Subject to approval and current availability shown in Live stock.</p></div>
      <div><h3>Orders</h3>{catalog.orders.map(order => <p key={order.orderId}>#{order.orderId} · {order.status} · {order.workingDaysSincePlaced} working days</p>)}</div>
    </div></section>}
    <footer className={styles.muted}>Messenger and Instagram DMs use this inbox when configured. Email and Viber integrations are deferred.</footer>
  </div>;
}
