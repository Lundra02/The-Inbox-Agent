import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import authRoutes from "../src/routes/authRoutes.js";
import { digest, hashPassword, requireStaff } from "../src/services/staffAuth.js";
import StaffAccount from "../src/models/StaffAccount.js";
import StaffSession from "../src/models/StaffSession.js";

const dbName = `inbox_auth_test_${Date.now()}`;
const origin = "http://localhost:5173";

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] || "";
}

test("staff login, logout, expiry, and unauthorized requests are enforced", async t => {
  assert.ok(process.env.MONGO_URI, "MONGO_URI is required for auth integration tests");
  await mongoose.connect(process.env.MONGO_URI, { dbName });
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.get("/api/protected", requireStaff, (req, res) => res.json({ username: req.staff.username }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${url}${path}`, { ...options, headers: { Origin: origin, "Content-Type": "application/json", ...(options.headers || {}) } });

  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  assert.equal((await request("/api/protected")).status, 401);
  const setup = await request("/api/auth/setup", { method: "POST", body: JSON.stringify({ username: "auralith", displayName: "auralith", password: "Auralith12345" }) });
  assert.equal(setup.status, 201);

  const failedLogin = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "auralith", password: "wrong-password" }) });
  assert.equal(failedLogin.status, 401);
  assert.match(await failedLogin.text(), /Invalid username or password/);

  const login = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "auralith", password: "Auralith12345" }) });
  assert.equal(login.status, 200);
  const cookie = cookieFrom(login);
  assert.match(cookie, /^inbox_session=[a-f0-9]{64}$/);
  assert.equal((await request("/api/protected", { headers: { Cookie: cookie } })).status, 200);

  const logout = await request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  assert.equal((await request("/api/protected", { headers: { Cookie: cookie } })).status, 401);

  const expiredToken = "a".repeat(64);
  await StaffSession.create({ tokenHash: digest(expiredToken), staffId: "primary", expiresAt: new Date(Date.now() - 1000) });
  const expired = await request("/api/protected", { headers: { Cookie: `inbox_session=${expiredToken}` } });
  assert.equal(expired.status, 401);
  assert.match(await expired.text(), /Session expired/);
});