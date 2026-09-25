// Expose only the signed webhook through a development tunnel.
import "dotenv/config";
import http from "node:http";
import { privacyPage } from "./publicPrivacy.js";

const backendPort = Number(process.env.PORT || 5000);
http.createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (["/privacy", "/privacy/", "/data-deletion", "/data-deletion/"].includes(path) && ["GET", "HEAD"].includes(req.method)) {
    const page = privacyPage();
    res.writeHead(page ? 200 : 503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === "HEAD" ? undefined : page || "Privacy information is being configured.");
    return;
  }
  if (!["/api/webhooks/messenger", "/api/webhooks/messenger/", "/api/webhooks/instagram", "/api/webhooks/instagram/"].includes(path) || !["GET", "POST"].includes(req.method)) {
    res.writeHead(404); res.end(); return;
  }
  const upstream = http.request({ hostname: "127.0.0.1", port: backendPort, path: req.url, method: req.method, headers: req.headers }, response => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.setTimeout(10000, () => upstream.destroy());
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
}).listen(5001, "127.0.0.1", () => console.log("Webhook-only tunnel proxy listening on 5001"));
