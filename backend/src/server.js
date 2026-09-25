import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectDB } from "./config/db.js";
import inboxRoutes from "./routes/inboxRoutes.js";
import InboxCase from "./models/InboxCase.js";
import InboxConversation from "./models/InboxConversation.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import { initializeInventory } from "./services/inventoryService.js";
import { createMessengerRouter } from "./routes/messengerWebhook.js";
import { isConfigured } from "./services/messengerService.js";
import { startMessengerWorker } from "./services/messengerWorker.js";
import authRoutes from "./routes/authRoutes.js";
import { allowedOrigins, requireStaff, requireTrustedOrigin } from "./services/staffAuth.js";
import StaffAccount from "./models/StaffAccount.js";
import StaffSession from "./models/StaffSession.js";
import StaffReply from "./models/StaffReply.js";
import InstagramEvent from "./models/InstagramEvent.js";
import { createInstagramRouter } from "./routes/instagramWebhook.js";
import { isInstagramConfigured, sendInstagramReply } from "./services/instagramService.js";
import { startMessagingWorker } from "./services/messengerWorker.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: allowedOrigins(), credentials: true }));
app.use("/api/webhooks/messenger", createMessengerRouter());
app.use("/api/webhooks/instagram", createInstagramRouter());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", requireTrustedOrigin);
app.use("/api/auth", authRoutes);
app.use("/api/inbox", requireStaff, (req, res, next) => { res.set("Cache-Control", "no-store"); next(); }, inboxRoutes);
app.use("/api/inventory", inventoryRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", project: "The Inbox Agent", messengerConfigured: isConfigured(), instagramConfigured: isInstagramConfigured() });
});

connectDB().then(async () => {
  // Claim the port before starting a worker or touching in-flight events.
  // A duplicate local backend must exit without consuming the same inbox.
  await new Promise((resolve, reject) => {
    const server = app.listen(port, (error) => error ? reject(error) : resolve());
    server.once("error", reject);
  });
  await Promise.all([InboxCase.init(), InboxConversation.init(), StaffAccount.init(), StaffSession.init(), StaffReply.init()]);
  await initializeInventory();
  if (isConfigured()) await startMessengerWorker();
  else console.log("Messenger disabled: complete Messenger settings in backend/.env");
  if (isInstagramConfigured()) await startMessagingWorker({ events: InstagramEvent, channel: "instagram", send: sendInstagramReply });
  else console.log("Instagram disabled: complete Instagram settings in backend/.env");
  console.log(`Server running on port ${port}`);
}).catch(() => { console.error("Server initialization failed; check database indexes and configuration"); process.exit(1); });
