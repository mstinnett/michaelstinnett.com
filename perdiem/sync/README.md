# Per Diem — shared storage over Tailscale

A tiny store that lets both of you share **one living plan** across devices, without
putting anything on the public web. The Per Diem app (served from GitHub Pages) talks
to this service, which runs on your **NAS** and is reachable **only on your tailnet**.

It does two jobs:

1. **Shared storage** — one JSON document per workspace, synced between your devices.
2. **Calendar proxy** — fetches subscribed `webcal://` schedule feeds on the app's
   behalf, because scheduler sites don't send CORS headers and a browser can't read
   them directly. See [Calendar feeds](#calendar-feeds) below.

- **Access = network reachability.** Your devices (on Tailscale) can reach it; the rest
  of the internet cannot. There's no public URL to leak or brute-force.
- **Data** is one JSON document per *workspace*, stored as a file under `./data`.
- **Sync** is whole-document last-write-wins: each save bumps a `rev`; the other device
  polls (~7s) and pulls when `rev` changes. Off-tailnet you just work locally and it
  re-syncs when you're back on.

## 1. Run the service on the NAS

**Docker (recommended):**
```sh
cd perdiem/sync
docker compose up -d --build
# listens on 127.0.0.1:8787, data in ./data
```

**Node (no Docker):**
```sh
cd perdiem/sync
ALLOW_ORIGIN="https://michaelstinnett.com" node server.js   # add PORT=… TOKEN=… as needed
# keep it alive with pm2, systemd, or your NAS's "run at boot" task
```

Env vars: `PORT` (8787), `DATA_DIR` (./data), `ALLOW_ORIGIN` (set to `https://michaelstinnett.com`),
`TOKEN` (optional — if set, every request must send `Authorization: Bearer <TOKEN>`).

Endpoints: `GET /health` · `GET|PUT /doc/<workspace>` · `GET /ics?url=<feed url>`.

## 2. Expose it over Tailscale (with HTTPS)

`tailscale serve` proxies it and gives you a real HTTPS cert on your tailnet name — that
matters because the app is HTTPS and browsers won't call an HTTP endpoint from an HTTPS page.

```sh
tailscale serve --bg 8787
tailscale serve status        # shows the https URL
```
That prints something like `https://nas.your-tailnet.ts.net/` → **that's your endpoint URL.**
(One-time: enable HTTPS/MagicDNS in the Tailscale admin console if it asks.)

> Do **not** use `tailscale funnel` — that publishes it to the whole internet, which is
> exactly what we're avoiding. `serve` keeps it tailnet-only.

## 3. Connect the app (each device, once)

On every device that should sync — including phones — install the **Tailscale app** and be
on the tailnet. Then in Per Diem:

1. Header → the **sync chip** (says "sync off") → opens *Shared storage*.
2. **Endpoint URL:** `https://nas.your-tailnet.ts.net`
3. **Workspace:** `shared` (any name; both of you use the same one to share a plan).
4. **Token:** only if you set `TOKEN` above.
5. **test** → should say "reached", then **connect**.

Both people enter the **same URL + workspace**. First connect creates the doc from whatever's
on that device; after that, edits flow both ways. The address is saved only in that device's
`localStorage` — it never goes into the public site.

## Calendar feeds

Per Diem can subscribe to the calendar link your scheduler publishes — ShiftAdmin's
`webcal://www.shiftadmin.com/schedule_ical.php?cd=v2&u=…&h=…`, or any `.ics` URL — and
fold it into the plan on a timer.

In the app: **Menu → Calendar feeds → paste the link → subscribe**. It checks hourly by
default (15 min – daily), and **check now** pulls immediately.

**Why this service has to be involved.** The app runs at `https://michaelstinnett.com`;
shiftadmin.com sends no `Access-Control-Allow-Origin` header, so the browser refuses to
hand the app the response. `GET /ics?url=…` fetches the feed here instead and returns it
with our CORS header. Without shared storage connected, a feed check fails — the feed
row then offers a **paste .ics** box, which reconciles pasted text with no network at all.

The proxy follows up to 5 redirects, caps a feed at 4 MB and 15 s, requires the same
`TOKEN` as everything else, and **refuses private, loopback, link-local and CGNAT
addresses** so it can't be turned into a probe of your LAN.

**What a check does.** Each event becomes one shift on its local start date (the plan
holds one shift per day; same-day events collapse to the earliest). Then:

- a day she **requested** that comes back on the feed → promoted to **scheduled**, silently
- a scheduled day she **never requested** → added, and **flagged** — the app pops an alert
  listing them, since those are the ones she may not know about
- a shift the feed later **drops** (inside the span it publishes) → removed, and flagged
- a shift **dropped** by hand stays gone; if the schedule genuinely moves it, it returns

Reconciling is idempotent, so a missed hour or a double-check costs nothing. It never
touches money, co-location or actuals, never edits a frozen catch-up month, and a feed's
very first pull on a device adopts the schedule quietly instead of flagging all of it.
Feed *definitions* are shared through the workspace; *when this device last checked* is
kept in that device's `localStorage`, so an idle check writes nothing and never wakes the
other phone.

## Notes

- **Back up `./data`** — that's your plans.
- Multiple workspaces are free: use different names (e.g. `shared`, `lydia-scratch`).
- The chip shows status: ● synced / saving / offline / error. "Updated from another device"
  toasts when the other person's change lands.
- Conflicts (both saving in the same few seconds) resolve last-write-wins; the loser's device
  pulls the winner on its next poll. For a 2-person tool that's rarely-to-never an issue.
