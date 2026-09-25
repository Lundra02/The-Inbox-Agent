import { useState } from "react";
import api from "../api/api";
import styles from "./Auth.module.css";

export default function Auth({ setupRequired, error: initialError, onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = setupRequired ? "/api/auth/setup" : "/api/auth/login";
      await api.post(path, setupRequired ? { username, password, displayName } : { username, password });
      if (setupRequired) await api.post("/api/auth/login", { username, password });
      onAuthenticated();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <section className={styles.panel}>
      <p className={styles.eyebrow}>THE INBOX AGENT</p>
      <h1>{setupRequired ? "Create your staff account" : "Staff sign in"}</h1>
      <p className={styles.muted}>{setupRequired ? "Set up the first local account before opening the inbox." : "Sign in to access customer conversations and analytics."}</p>
      <form onSubmit={submit}>
        {setupRequired && <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} required /></label>}
        <label>Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={setupRequired ? "new-password" : "current-password"} minLength={setupRequired ? 12 : undefined} required /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button disabled={busy}>{busy ? "Please wait..." : setupRequired ? "Create account" : "Sign in"}</button>
      </form>
    </section>
  </main>;
}