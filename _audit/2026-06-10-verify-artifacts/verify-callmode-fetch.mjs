import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webDir = path.resolve("app/apps/web");
const env = readFileSync(path.join(webDir, ".env.local"), "utf8");
const secret = /^AUTH_SECRET=["']?([^"'\r\n]+)/m.exec(env)[1];
process.env.AUTH_SECRET = secret;
const require = createRequire(path.join(webDir, "package.json"));
const { encode } = require("next-auth/jwt");

const cookie = await encode({
  token: {
    id: "890bac78-0347-47f0-a36c-9cbafeed4348",
    sub: "890bac78-0347-47f0-a36c-9cbafeed4348",
    tenantId: "47dca783-dac0-45a5-85cb-d217b2a3174d",
    appUserId: "82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46",
    role: "member",
    name: "Martin Paviot",
    email: "martin@elevay.dev",
  },
  secret,
  salt: "authjs.session-token",
  maxAge: 28800,
});
for (const p of ["/call-mode", "/home", "/accounts", "/api/notifications?limit=5"]) {
  const res = await fetch("http://127.0.0.1:3001" + p, {
    headers: { cookie: "authjs.session-token=" + cookie },
    redirect: "manual",
  });
  const body = await res.text();
  console.log(p, "->", res.status, res.headers.get("location") || "", body.length + "B");
}
