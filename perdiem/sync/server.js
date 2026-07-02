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
 */
const http = require("http");
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

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean); // ["doc","<id>"]

  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

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
