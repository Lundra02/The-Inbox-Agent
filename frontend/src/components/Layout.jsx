import { NavLink, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

const navigation = [
  { to: "/", label: "Customer inbox", end: true },
  { to: "/stock", label: "Live stock", end: true },
];

export default function Layout({ onLogout }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <NavLink to="/" className={styles.brand}>
          <span className={styles.mark}>I</span>
          <span>
            <strong>The Inbox Agent</strong>
            <small>Electronics · SQ / EN</small>
          </span>
        </NavLink>

        <nav className={styles.navigation} aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ""}`}
              end={item.end}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.liveDot} />
          Hackathon demo
        </div>
        <a className={styles.navLink} href="https://m.me/1290531860817953" target="_blank" rel="noopener noreferrer">
          Chat on Messenger
        </a>
        <button className={styles.logout} onClick={onLogout} type="button">Sign out</button>
      </aside>

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
