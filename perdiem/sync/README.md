# Per Diem — shared storage over Tailscale

A tiny store that lets both of you share **one living plan** across devices, without
putting anything on the public web. The Per Diem app (served from GitHub Pages) talks
to this service, which runs on your **NAS** and is reachable **only on your tailnet**.

It does three jobs:

1. **Shared storage** — one JSON document per workspace, synced between your devices.
2. **Calendar proxy** — fetches subscribed `webcal://` schedule feeds on the app's
   behalf, because scheduler sites don't send CORS headers and a browser can't read
   them directly. See [Calendar feeds](#calendar-feeds) below.
3. **Attachments** — holds the kids' school-calendar PDFs as plain files, so the plan
   document stays small. See [Calendar PDFs](#calendar-pdfs) below.

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

Endpoints:

| | |
|---|---|
| `GET /health` | liveness |
| `GET`, `PUT` `/doc/<workspace>` | the plan document |
| `GET /ics?url=<feed url>` | calendar-feed proxy |
| `GET`, `PUT`, `DELETE` `/file/<workspace>/<id>` | one attachment |
| `GET /files/<workspace>` | what attachments exist |

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

In the app: **Menu → Calendar feeds → paste the link → subscribe**.

**When it checks.** On open — always, as soon as the shared plan has landed, so what
you're looking at is current. Then on the feed's own interval while the app stays open
(hourly by default; 15 min – daily). And again whenever you come back to the app: a phone
freezes a backgrounded tab and its timers with it, so returning catches up on whatever
fell due meanwhile. **Check now** pulls immediately.

It all runs in whichever browser has the app open, so the phone is fine — as long as it's
on the tailnet, since the pull goes through this service. Nothing checks while the app is
closed everywhere; if you want the schedule reconciled around the clock, that would be a
job running here on the NAS rather than in the app.

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
- a shift the feed later **drops** → removed, and flagged — but see the window rule below
- a shift **dropped** by hand stays gone; if the schedule genuinely moves it, it returns

**A feed is a moving window.** It publishes a rolling span, and shifts leave that span
because the window slid past them, not because anyone cancelled anything. So a missing
shift only counts as cancelled when it's absent from the *interior* of the span the feed
just published: after today, and strictly between its first and last event. Anything
behind the window, ahead of it, on either edge, or today itself is left alone — the app
will never quietly delete schedule history because a feed stopped mentioning it.

Reconciling is idempotent, so a missed hour or a double-check costs nothing. It never
touches money, co-location or actuals, never edits a frozen catch-up month, and a feed's
very first pull on a device adopts the schedule quietly instead of flagging all of it.
Feed *definitions* are shared through the workspace; *when this device last checked* is
kept in that device's `localStorage`, so an idle check writes nothing and never wakes the
other phone.

## Calendar PDFs

The schools publish their year as a PDF. Attach it to the matching calendar —
**Menu → Family time settings → the calendar → attach PDF** — and either of you can
open it from the app: tap the 📄 next to the calendar in the drawer, or on any day
that calendar covers, straight from the day's readout.

The plan document only ever holds a reference (`{id, name, type, size}`); the bytes
live here under `DATA_DIR/files/<workspace>/` as `<id>.bin` next to a small `<id>.json`
of metadata. That keeps the synced document small and quick. Attachments therefore
**need shared storage connected** — there's nowhere else to put them.

- PDFs and images (PNG, JPEG, WebP, GIF), 25 MB each, 12 per calendar. Anything else is
  stored and served as an opaque download, never as something a browser would run.
- Viewing renders the PDF to canvas with pdf.js, loaded from the CDN only when you
  actually open one — phones often show nothing for a PDF in an `<iframe>`, and this
  works everywhere. If the CDN can't be reached it falls back to the browser's own
  frame, and **open** / **save** work regardless.
- Removing an attachment deletes it here too; so does deleting the calendar.

## Notes

- **Back up `./data`** — that's your plans (and `./data/files`, the calendar PDFs).
- Multiple workspaces are free: use different names (e.g. `shared`, `lydia-scratch`).
- The chip shows status: ● synced / saving / offline / error. "Updated from another device"
  toasts when the other person's change lands.
- Conflicts (both saving in the same few seconds) resolve last-write-wins; the loser's device
  pulls the winner on its next poll. For a 2-person tool that's rarely-to-never an issue.
