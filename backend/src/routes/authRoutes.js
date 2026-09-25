import { Router } from "express";
import { randomBytes } from "node:crypto";
import StaffAccount from "../models/StaffAccount.js";
import StaffSession from "../models/StaffSession.js";
import { hashPassword, verifyPassword, digest, sessionToken, cookieOptions, requireStaff, localSetupAllowed } from "../services/staffAuth.js";
const router = Router();
const attempts = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.socket.remoteAddress;
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 10) return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  entry.count++; attempts.set(key, entry); next();
}
router.get("/status", async (req, res) => {
  try { res.set("Cache-Control", "no-store").json({ setupRequired: !await StaffAccount.exists({ _id: "primary" }) }); }
  catch { res.status(503).json({ error: "Account storage unavailable" }); }
});
router.post("/setup", throttle, async (req, res) => {
  if (!localSetupAllowed(req)) return res.status(403).json({ error: "Create the first account from the local dashboard." });
  const { username, password, displayName } = req.body || {};
  if (typeof username !== "string" || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username) || typeof password !== "string" || password.length < 12 || password.length > 128 || typeof displayName !== "string" || !displayName.trim() || displayName.length > 80) return res.status(400).json({ error: "Use a username of 3–40 letters/numbers, a display name, and a password of 12–128 characters." });
  try {
    await StaffAccount.create({ _id: "primary", username: username.toLowerCase(), displayName: displayName.trim(), passwordHash: await hashPassword(password) });
    res.status(201).json({ created: true });
  } catch (error) { res.status(error.code === 11000 ? 409 : 503).json({ error: error.code === 11000 ? "Account already configured. Sign in." : "Account creation unavailable" }); }
});
router.post("/login", throttle, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || username.length > 40 || typeof password !== "string" || password.length > 128) return res.status(400).json({ error: "Invalid credentials" });
  try {
    const staff = await StaffAccount.findById("primary");
    if (!staff || !await verifyPassword(password, staff.passwordHash) || staff.username !== username.toLowerCase()) return res.status(401).json({ error: "Invalid username or password" });
    const token = randomBytes(32).toString("hex");
    await StaffSession.create({ tokenHash: digest(token), staffId: staff.id, expiresAt: new Date(Date.now() + cookieOptions().maxAge) });
    attempts.delete(req.socket.remoteAddress);
    res.cookie("inbox_session", token, cookieOptions()).json({ username: staff.username, displayName: staff.displayName });
  } catch { res.status(503).json({ error: "Login unavailable" }); }
});
router.get("/me", requireStaff, (req, res) => res.set("Cache-Control", "no-store").json(req.staff));
router.post("/logout", async (req, res) => {
  try { await StaffSession.deleteOne({ tokenHash: digest(sessionToken(req)) }); res.clearCookie("inbox_session", { ...cookieOptions(), maxAge: undefined }).json({ loggedOut: true }); }
  catch { res.status(503).json({ error: "Could not end session" }); }
});
export default router;
