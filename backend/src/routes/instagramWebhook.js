import InstagramEvent from "../models/InstagramEvent.js";
import { createMessagingRouter } from "./messengerWebhook.js";
import { instagramConfig, isInstagramConfigured, extractInstagramEvents } from "../services/instagramService.js";

export function createInstagramRouter({ config = instagramConfig(), events = InstagramEvent } = {}) {
  return createMessagingRouter({ config, events, object: "instagram", extract: extractInstagramEvents, configured: isInstagramConfigured });
}
