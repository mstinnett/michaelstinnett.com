# 03 — Sync architecture

## What lives where

| Data | On device | iCloud (Apple households) | Household server | Notes |
|---|---|---|---|---|
| Working sheet (per kid) | Yes | Yes | Later, paid sync | Survives restarts; resumes on any device |
| Kept pages | Yes | Yes | Later, paid sync | Page data, a few KB each; thumbnails are never synced |
| Scrap pile | Yes | Yes, 30 days | Later, paid sync | Each device removes entries older than 30 days |
| Sticker images | Yes, cached | Yes, by hash | Robot stickers by hash | Stored once per household; pages refer to the hash |
| Profiles, stages, rail layouts | Yes | Yes | Mirror for approvals | Household-level; every profile works on every device |
| Household PIN | Hash only | Hash only | Hash only | Separate from any device passcode |
| Approval requests | Yes (log) | Apple-sheet approvals only | Robot approvals | One protocol, two transports (see below) |
| Credits | Display copy | Never | **Authority** | Reserved on approval, charged on success, refunded on failure |
| Activity log | Yes, full | Yes | Short catch-up buffer only | Guardians keep the log; the server only relays |
| Capability record | Yes, per device | Summary for parents | — | Live: network, iCloud, Apple Intelligence, credits, guardian reachability |

## Sync components on the device

```mermaid
flowchart LR
  subgraph app["App"]
    ui["UI and engines"]
    store["Local store<br/>(SQLite)"]
    outbox["Outbox<br/>pending changes,<br/>in order"]
    cap["Capability record"]
  end
  subgraph sync["SyncKit"]
    router["Sync router<br/>picks a backend per household"]
    ckb["CloudKitBackend<br/>private DB + household<br/>shared zone"]
    svb["ServerBackend<br/>HTTPS + WebSocket<br/>(paid sync, later)"]
  end
  ui -->|"writes"| store
  store -->|"appends change"| outbox
  outbox --> router
  router --> ckb
  router -.-> svb
  ckb -->|"remote changes"| store
  svb -.->|"remote changes"| store
  cap -->|"online? iCloud ok?"| router
```

- **Writes always land in the local store first.** The outbox drains when the capability record says the backend is reachable, oldest first, retrying with backoff.
- **One backend per household.** All-Apple households use CloudKit. Mixed households use the server once paid sync exists. Until then, a mixed household syncs between its Apple devices via iCloud, and Android devices keep data on the device.
- **Conflicts fork, never merge.** If one page changed on two devices before syncing, both versions are kept and the later one becomes a new page beside the original, so a kid never loses a drawing. The working sheet, which only one device should be drawing on at a time, uses last-writer-wins, and the losing version goes to the scrap pile instead of disappearing.
- **Thumbnails are rendered locally** from page data and cached by content hash. They never sync.
- **Sticker images sync by content hash**, so placing the same sticker on 50 pages stores it once.

## CloudKit layout (Apple households)

| Zone | Contents | Shared with |
|---|---|---|
| Household shared zone (CKShare) | Profiles, stages, rail layouts, PIN hash, sticker images, kept pages, working sheets, scrap pile, Apple-sheet approval records, log | Invited guardians and paired kid devices |
| Each guardian's private database | That guardian's own preferences | Nobody |

Guardians join by CloudKit share invitation, which works across any Apple accounts with no Family Sharing. A kid's iPad signed into a parent's or child Apple account joins the same share during pairing.

## Sequence: keeping a page (Apple household)

```mermaid
sequenceDiagram
  autonumber
  participant K as Kid
  participant A as App (her iPad)
  participant S as Local store
  participant C as CloudKit
  participant P as Parent's phone
  K->>A: taps keep
  A->>A: hash page content
  alt same hash as the kept copy
    A-->>K: kept page wiggles (no duplicate)
  else new or changed
    A->>S: write kept page and outbox entry
    A-->>K: page flies into the notebook
    S->>C: outbox drains when online
    C-->>P: change notification
    P->>P: pull page, render thumbnail locally
  end
```

## Approvals: one protocol, two transports

The request and decision logic is the portable family core ([06](06-family-core.md)). Only delivery differs.

| Request type | Transport | Why |
|---|---|---|
| Robot prompt ("spend one credit on this?") | Household server relay | Spends credits, which only the server holds |
| Robot result ("send this sticker to her device?") | Household server relay | Same request, second stage |
| Apple-sheet result | CloudKit records in the household zone, with CloudKit push | Free; no credits involved |
| Grown-up door on a kid's device | Household server relay if reachable, PIN otherwise | Needs to be fast |

The shared test suite runs every approval case through both transports.

## Sequence: robot sticker with both approvals, including offline

```mermaid
sequenceDiagram
  autonumber
  participant K as Kid
  participant A as App (kid device)
  participant F as Family core (device)
  participant W as API Worker
  participant H as Household channel
  participant G as Guardian phone
  participant O as OpenAI

  K->>A: says an idea (on-device speech)
  A->>F: new request (prompt, stage, capabilities)
  F->>F: on-device copyright check if available
  alt offline
    F-->>A: queue it
    A-->>K: robot holds the idea in an envelope
    Note over A: sends when the capability record says online
  end
  A->>W: submit request
  W->>W: server copyright check
  alt named character
    W-->>A: redirect with original suggestions
    A-->>K: "Robot can't draw that. How about...?"
  else ok
    W->>H: enqueue (stage requires prompt approval)
    H->>G: push "Spend one credit on this?"
    A-->>K: robot waits with the envelope
    G->>H: approve with Face ID
    H->>H: reserve one credit
    H->>W: generate
    W->>O: image request
    alt failure or timeout
      W->>H: release the reserved credit
      H-->>A: try again later
    else image returned
      W->>H: charge the credit, store image by hash in R2
      H->>G: push "Send this sticker to her device?"
      G->>H: approve
      H-->>A: sticker delivered
      A->>A: palette snap and outline on the device
      A-->>K: robot runs in with the sticker
    end
  end
  Note over H,G: an unanswered request expires after a day,<br/>releasing any reservation
```

## Sequence: pairing a new device

```mermaid
sequenceDiagram
  autonumber
  participant G as Guardian (grown-up area)
  participant W as API Worker
  participant D as New device
  participant C as CloudKit
  G->>W: create pairing code
  W-->>G: QR code and 6-digit code (expires in 10 minutes)
  D->>W: scan or enter code
  W->>W: register device under the household
  W-->>D: device token and household id
  opt Apple household
    G->>C: add the device's account to the household share
    D->>C: accept share, pull profiles and pages
  end
  D-->>D: open to the profile splash<br/>(or straight to a kid if locked)
```

## Scrap pile expiry

Each device removes scrap-pile entries older than 30 days from its local store and from the household zone it can write to. Removal is idempotent, so two devices doing it at once is harmless. A sheet restored from the scrap pile becomes the working sheet and leaves the pile.
