import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Inbox from "./pages/Inbox";
import Inventory from "./pages/Inventory";
import Auth from "./pages/Auth";
import api from "./api/api";
import "./App.module.css";
import { useEffect, useState } from "react";

export default function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, setupRequired: false });

  useEffect(() => {
    api.get("/api/auth/me")
      .then(() => setAuth({ loading: false, authenticated: true, setupRequired: false }))
      .catch(async (error) => {
        if (error.response?.status !== 401) {
          setAuth({ loading: false, authenticated: false, setupRequired: false, error: "The backend is unavailable." });
          return;
        }
        try {
          const { data } = await api.get("/api/auth/status");
          setAuth({ loading: false, authenticated: false, setupRequired: data.setupRequired });
        } catch {
          setAuth({ loading: false, authenticated: false, setupRequired: false, error: "Could not check staff account status." });
        }
      });
  }, []);

  if (auth.loading) return <div className="auth-loading">Checking staff session...</div>;
  if (!auth.authenticated) return <Auth setupRequired={auth.setupRequired} error={auth.error} onAuthenticated={() => setAuth({ loading: false, authenticated: true, setupRequired: false })} />;

  async function logout() {
    try { await api.post("/api/auth/logout"); }
    catch {}
    finally { setAuth({ loading: false, authenticated: false, setupRequired: false }); }
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout onLogout={logout} />}>
          <Route path="/" element={<Inbox />} />
                    <Route path="/stock" element={<Inventory />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
