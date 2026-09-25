import mongoose from "mongoose";
import MessengerEvent from "./MessengerEvent.js";

// Same durable queue contract; pageId is the receiving Instagram account ID and
// psid is the Instagram-scoped sender ID. Existing Messenger records stay intact.
export default mongoose.model("InstagramEvent", MessengerEvent.schema.clone());
