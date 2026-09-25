import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import StaffSession from "../models/StaffSession.js";
import StaffAccount from "../models/StaffAccount.js";
const scrypt = promisify(scryptCallback);
export const digest = value => createHash("sha256").update(value).digest("hex");
export const allowedOrigins = () => (process.env.STAFF_ALLOWED_ORIGINS || "http://localhost:4173,http://127.0.0.1:4173,http://localhost:5173,http://127.0.0.1:5173").split(",").map(v => v.trim());
export function requireTrustedOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || allowedOrigins().includes(req.get("Origin"))) return next();
  return res.status(403).json({ error: "Untrusted request origin" });
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(":");
  const candidate = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
export function sessionToken(req) {
  return (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith("inbox_session="))?.slice(14) || "";
}
export const cookieOptions = () => ({ httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api", maxAge: 8 * 60 * 60 * 1000 });
export async function requireStaff(req, res, next) {
  try {
    const token = sessionToken(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: "Staff login required" });
    const session = await StaffSession.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
    const staff = session && await StaffAccount.findById(session.staffId);
    if (!staff) return res.status(401).json({ error: "Session expired. Please sign in." });
    req.staff = { id: staff.id, username: staff.username, displayName: staff.displayName };
    next();
  } catch { res.status(503).json({ error: "Staff authentication unavailable" }); }
}
export function localSetupAllowed(req) {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  try { return local && ["localhost", "127.0.0.1"].includes(new URL(req.get("Origin")).hostname); }
  catch { return false; }
}
