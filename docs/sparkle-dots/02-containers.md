# 02 — Containers (C4 level 2)

The deployable and runnable pieces. The two cores are highlighted: the **page engine** (Swift, later Kotlin, held in sync by a shared conformance suite) and the **family core** (TypeScript, the same code everywhere).

```mermaid
flowchart TB
  subgraph device["Kid's or parent's device (iPhone, iPad; Android and Fire later)"]
    direction TB
    ui["<b>Native app UI</b><br/>[SwiftUI / Compose]<br/>Splash, draw, play, notebook,<br/>robot, grown-up area"]
    engine["<b>Page engine</b><br/>[Swift package; Kotlin port later]<br/>Page format, dot geometry, shapes and fills,<br/>activities, conformance-tested"]
    family["<b>Family core</b><br/>[TypeScript in JavaScriptCore / QuickJS]<br/>Households, profiles, stages, approvals,<br/>credit reservations, capability decisions"]
    store["<b>Local store</b><br/>[SQLite: GRDB / Room]<br/>Source of truth on the device:<br/>pages, scrap pile, stickers, outbox"]
    adapters["<b>Platform adapters</b><br/>[Swift / Kotlin]<br/>Sync backends, AI makers, speech,<br/>purchases, push, biometrics"]
    ui --> engine
    ui --> family
    ui --> store
    family --> adapters
    store --> adapters
  end

  subgraph apple["Apple (free to us)"]
    ck["<b>CloudKit</b><br/>Private database plus a household<br/>shared zone (CKShare)"]
    pcc["<b>Image Playground</b><br/>System sheet, Private Cloud Compute"]
  end

  subgraph server["Household server (Cloudflare)"]
    direction TB
    worker["<b>API Worker</b><br/>[TypeScript]<br/>Auth, pairing, purchase verification,<br/>robot proxy, copyright guard"]
    hdo["<b>Household channel</b><br/>[Durable Object per household]<br/>Approval queue, live updates,<br/>short catch-up buffer"]
    d1["<b>D1</b><br/>Households, members, devices,<br/>credit ledger"]
    r2["<b>R2</b><br/>Stickers by hash; pages for<br/>server-sync households (later)"]
    fcore["<b>Family core</b><br/>[same TypeScript]<br/>The authority for approvals and credits"]
    worker --> hdo
    worker --> d1
    worker --> r2
    hdo --> fcore
    worker --> fcore
  end

  console["<b>Web console</b><br/>[TypeScript, later]<br/>Approvals and notebooks for guardians<br/>without the app (Android, grandparents)"]

  openai["<b>OpenAI Images</b>"]
  push["<b>APNs / FCM</b>"]

  adapters -.->|"records and shares"| ck
  adapters -.->|"system sheet"| pcc
  adapters -->|"HTTPS + WebSocket"| worker
  worker -->|"image requests"| openai
  hdo -->|"notifications"| push
  console -->|"HTTPS"| worker

  classDef core fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  class engine,family,fcore core
```

## What runs where

| Container | Runs on | Owns | Needs network |
|---|---|---|---|
| Native app UI | Device | Screens and input, nothing else | No |
| Page engine | Device | The page format and everything computed from it | No |
| Family core (device copy) | Device, embedded JS engine | Policy decisions for instant UI | No |
| Local store | Device | All of the kid's data on that device | No |
| Platform adapters | Device | Talking to iCloud, the server, OS services | Some adapters |
| CloudKit | Apple | Sync for Apple-only households | Yes |
| API Worker | Cloudflare | Auth, pairing, purchases, robot proxy, server guard | — |
| Household channel | Cloudflare | Approval queue and live updates per household | — |
| D1 | Cloudflare | Households, members, devices, credit ledger | — |
| R2 | Cloudflare | Sticker images by hash; later, pages for paid sync | — |
| Family core (server copy) | Cloudflare | The authority for approvals and credits | — |
| Web console | Browser (later) | Guardian screens for people without the app | Yes |

## Rules

- **The device copy of the family core decides what the UI shows. The server copy decides what actually happens.** Anything involving credits is re-checked on the server.
- **The local store is the source of truth on each device.** iCloud and the server are sync peers, never the place the app reads from directly.
- **Nothing in the page engine knows about families, sync or AI.** It takes a page and produces geometry, fills and activity state.
- **Nothing in the family core knows about drawing.** It sees opaque page ids, sticker hashes and typed approval payloads, so other apps can reuse it.
