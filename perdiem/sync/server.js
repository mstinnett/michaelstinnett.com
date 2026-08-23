#!/usr/bin/env node
/*
 * Per Diem — shared storage service (dependency-free).
 *
 * Stores one JSON document per "workspace" as a file under DATA_DIR.
 * Whole-document last-write-wins; each PUT bumps a monotonic `rev` so the
 * other device's poll can tell when something changed.
 *
 * Meant to run on your NAS and be exposed ONLY over your tailnet with
 * `tailscale serve` (which also gives it HTTPS). See README.md.
 *
 * Env:
 *   PORT          listen port                (default 8787)
 *   DATA_DIR      where docs are stored       (default ./data)
 *   TOKEN         if set, require  Authorization: Bearer <TOKEN>
 *   ALLOW_ORIGIN  CORS origin                 (default *  — set to https://michaelstinnett.com)
 *
 * Also proxies calendar feeds: GET /ics?url=<webcal|https url> returns the raw
 * .ics text with our CORS header, so the browser-only app can read shift feeds
 * that send no CORS headers of their own.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "8787", 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const TOKEN = process.env.TOKEN || "";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const MAX_BODY = 6 * 1024 * 1024; // 6 MB
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

fs.mkdirSync(DATA_DIR, { recursive: true });

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}
function send(res, code, obj) {
  const body = obj == null ? "" : JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}
function authed(req) {
  if (!TOKEN) return true;
  const h = req.headers["authorization"] || "";
  return h === "Bearer " + TOKEN;
}
const fileFor = (id) => path.join(DATA_DIR, id + ".json");

function readDoc(id) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(id), "utf8"));
  } catch (e) {
    return { rev: 0, updatedAt: null, data: null };
  }
}
function writeDoc(id, data) {
  const prev = readDoc(id);
  const doc = { rev: (prev.rev || 0) + 1, updatedAt: new Date().toISOString(), data };
  const tmp = fileFor(id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, fileFor(id)); // atomic replace
  return doc;
}

/* ── calendar proxy ──────────────────────────────────────────────────────────
 * The app is served from HTTPS GitHub Pages and shift-feed hosts (shiftadmin
 * and friends) send no CORS headers, so a browser can't read them directly.
 * This service can: it pulls the feed server-side and hands the text back with
 * our CORS header. It's tailnet-only, and it refuses private/loopback targets
 * so it can never be pointed back at the LAN.
 */
const ICS_TIMEOUT = 15000;
const ICS_MAX = 4 * 1024 * 1024;
const ICS_REDIRECTS = 5;

function privateHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;               // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT range — tailnets live here
  }
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

function fetchICS(rawUrl, depth, cb) {
  let done = false;
  const finish = (err, text) => { if (done) return; done = true; cb(err, text); };
  let u;
  try { u = new URL(String(rawUrl).replace(/^webcal:\/\//i, "https://")); }
  catch (e) { return finish(new Error("bad url")); }
  if (u.protocol !== "https:" && u.protocol !== "http:") return finish(new Error("unsupported scheme"));
  if (privateHost(u.hostname)) return finish(new Error("refused: private address"));

  const mod = u.protocol === "https:" ? https : http;
  const req = mod.get(u, { headers: { "User-Agent": "per-diem-sync/1", "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.5" } }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      if (depth >= ICS_REDIRECTS) return finish(new Error("too many redirects"));
      let next; try { next = new URL(r.headers.location, u).toString(); } catch (e) { return finish(new Error("bad redirect")); }
      done = true;                                          // hand off to the next hop
      return fetchICS(next, depth + 1, cb);
    }
    if (r.statusCode !== 200) { r.resume(); return finish(new Error("upstream HTTP " + r.statusCode)); }
    let size = 0; const chunks = [];
    r.on("data", (c) => {
      size += c.length;
      if (size > ICS_MAX) { req.destroy(); return finish(new Error("feed too large")); }
      chunks.push(c);
    });
    r.on("end", () => finish(null, Buffer.concat(chunks).toString("utf8")));
    r.on("error", (e) => finish(e));
  });
  req.setTimeout(ICS_TIMEOUT, () => { req.destroy(); finish(new Error("timed out")); });
  req.on("error", (e) => finish(e));
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean); // ["doc","<id>"]

  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, ics: true });

  if (url.pathname === "/ics") {
    if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    const target = url.searchParams.get("url");
    if (!target) return send(res, 400, { error: "missing url" });
    return fetchICS(target, 0, (err, text) => {
      if (err) return send(res, 502, { error: String(err.message || err) });
      res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8" });
      res.end(text);
    });
  }

  if (parts[0] === "doc" && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    if (!ID_RE.test(id)) return send(res, 400, { error: "bad workspace id" });
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "GET") {
      const d = readDoc(id);
      return send(res, 200, { rev: d.rev || 0, updatedAt: d.updatedAt || null, data: d.data ?? null });
    }
    if (req.method === "PUT") {
      let size = 0; const chunks = [];
      req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(c); });
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const d = writeDoc(id, body.data);
          send(res, 200, { rev: d.rev, updatedAt: d.updatedAt });
        } catch (e) { send(res, 400, { error: "bad body" }); }
      });
      req.on("error", () => send(res, 400, { error: "read error" }));
      return;
    }
    return send(res, 405, { error: "method not allowed" });
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`per-diem sync listening on :${PORT}  data=${DATA_DIR}  auth=${TOKEN ? "token" : "none"}  origin=${ALLOW_ORIGIN}`);
});
