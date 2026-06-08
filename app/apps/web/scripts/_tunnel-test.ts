import WebSocket from "ws";
const url = "wss://hotel-triumph-diploma-terry.trycloudflare.com?callId=conntest";
console.log("connecting", url);
const ws = new WebSocket(url);
const t = setTimeout(() => { console.log("TIMEOUT — no open in 15s"); process.exit(1); }, 15000);
ws.on("open", () => { clearTimeout(t); console.log("WS OPEN — Twilio→cloudflare→WS server path WORKS"); setTimeout(() => { ws.close(); process.exit(0); }, 1500); });
ws.on("error", (e: Error) => { clearTimeout(t); console.log("WS ERROR:", e.message); process.exit(1); });
