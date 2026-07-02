# Per Diem — shared storage over Tailscale

A tiny store that lets both of you share **one living plan** across devices, without
putting anything on the public web. The Per Diem app (served from GitHub Pages) talks
to this service, which runs on your **NAS** and is reachable **only on your tailnet**.

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

## Notes

- **Back up `./data`** — that's your plans.
- Multiple workspaces are free: use different names (e.g. `shared`, `lydia-scratch`).
- The chip shows status: ● synced / saving / offline / error. "Updated from another device"
  toasts when the other person's change lands.
- Conflicts (both saving in the same few seconds) resolve last-write-wins; the loser's device
  pulls the winner on its next poll. For a 2-person tool that's rarely-to-never an issue.
