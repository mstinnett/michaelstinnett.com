# 05 — Seams and fallbacks

Every feature that depends on something outside the app (a network, a server, Apple Intelligence, iCloud, credits) sits behind a port. The full experience and each fallback are adapters for the same port, chosen from the capability record. The cores sit in the middle and never know which adapter is plugged in.

## Where the cores live

```mermaid
flowchart LR
  pe["<b>PageEngine</b><br/>Swift / Kotlin<br/>no ports: drawing, stickers,<br/>notebook, activities<br/>always work offline"]
  fc["<b>FamilyCore</b><br/>TypeScript<br/>decides which adapter<br/>from the capability record"]

  fc --> P1["StickerMaker"]
  P1 --> F1["Robot<br/>server relay + OpenAI"]
  P1 --> B1["Apple Image<br/>Playground sheet"]
  P1 --> N1["Robot asleep;<br/>packs still work"]

  fc --> P2["PromptGuard"]
  P2 --> F2["Server guard<br/>(always for robot)"]
  P2 --> B2["On-device check<br/>(Apple's model)"]
  P2 --> N2["Request waits;<br/>never sent unchecked"]

  fc --> P3["Transcriber"]
  P3 --> F3["On-device speech"]
  P3 --> N3["Mic hidden;<br/>a grown-up types"]

  fc --> P4["SyncBackend"]
  P4 --> F4["iCloud now;<br/>server sync later"]
  P4 --> B4["Local only;<br/>outbox waits"]

  fc --> P5["ApprovalTransport"]
  P5 --> F5["Server relay + push"]
  P5 --> B5["CloudKit records<br/>(Apple-sheet results)"]
  P5 --> N5["Envelope waits;<br/>expires after a day"]

  fc --> P6["Unlock"]
  P6 --> F6["Face ID, or approval<br/>from a parent's phone"]
  P6 --> B6["Household PIN"]

  fc --> P7["Purchases"]
  P7 --> F7["App Store / Play / Amazon"]
  P7 --> N7["Buttons hidden offline"]

  classDef core fill:#e1f5ee,stroke:#0f6e56,color:#04342c
  classDef port fill:#f1efe8,stroke:#5f5e5a,color:#2c2c2a
  classDef full fill:#e6f1fb,stroke:#185fa5,color:#042c53
  classDef fallback fill:#faeeda,stroke:#854f0b,color:#412402
  classDef none fill:#ffffff,stroke:#888780,color:#444441,stroke-dasharray:4 3
  class pe,fc core
  class P1,P2,P3,P4,P5,P6,P7 port
  class F1,F2,F3,F4,F5,F6,F7 full
  class B1,B2,B4,B5,B6 fallback
  class N1,N2,N3,N5,N7 none
```

Blue is the full experience, amber the fallback, dashed white what a kid or parent sees when neither is available.

The page engine has no ports at all: drawing, stickers, fills, the notebook and all four activities work with no network and no outside services.

## Capability-by-capability

| Capability | Full experience | Fallback | Nothing available | Who sees it |
|---|---|---|---|---|
| Sync | iCloud (Apple households); server sync later | Local store plus outbox; catches up later | Same: works entirely on the device | Parents see sync status |
| Approvals | Server relay, push, Face ID | CloudKit records (Apple-sheet stickers); same-phone approval with Face ID | Request waits in the envelope; expires after a day | Kid sees robot states |
| Making a sticker | Robot (credits, online, enabled) | Apple Image Playground sheet (device supports it, Screen Time allows it, enabled) | Robot asleep; drawn packs still work | Kid sees robot states |
| Copyright guard | Server guard (always, for robot) | On-device check first, where Apple Intelligence is ready | Request waits; never sent unchecked | Kid sees redirect suggestions |
| Voice | On-device speech | — (no server fallback, by design) | Mic hidden; a grown-up types | Kid sees mic or not |
| Grown-up door | Face ID (own phone) or approval from a parent's phone (kid device) | Household PIN | — | Guardians |
| Purchases | App Store, Google Play, Amazon | — | Purchase buttons hidden offline | Guardians |
| Big page on a small screen | Page fits at comfortable spacing | Plus and minus zoom, minimap, two-finger pan | — | Kid, only when needed |

## The robot: what a kid sees

Every AI outcome maps onto a handful of robot states, so a kid never sees an error.

```mermaid
stateDiagram-v2
  [*] --> Asleep: no maker available
  [*] --> Awake: a maker is ready
  Asleep --> Awake: back online or credits added
  Awake --> Listening: taps the robot
  Listening --> Checking: idea finished
  Checking --> Redirect: named character found
  Redirect --> Listening: picks a suggestion or tries again
  Checking --> Envelope: needs a grown-up or offline
  Checking --> Drawing: no approval needed and online
  Envelope --> Drawing: approved and online
  Envelope --> Awake: declined or expired (gentle "let's try another")
  Drawing --> Showing: image back
  Drawing --> Awake: failed (credit refunded)
  Showing --> Envelope: result needs a grown-up
  Showing --> Placed: kid taps place
  Showing --> Drawing: kid taps retry (spends a credit)
  Showing --> Awake: kid taps discard
  Placed --> Awake
  Awake --> OutOfPaint: no credits
  OutOfPaint --> Awake: guardian adds credits
```

Buttons follow the states: before an idea, **cancel** and **draw**. While drawing, **cancel** only. When a sticker comes back, **discard**, **retry** and a bigger **place**.

## Choosing a sticker maker

```mermaid
flowchart TD
  start["Kid taps the robot"] --> en{"Robot stickers enabled<br/>for this kid's stage?"}
  en -->|yes| cr{"Credits left?"}
  cr -->|no| oop["Robot out of paint<br/>(guardians notified)"]
  cr -->|yes| on{"Online?"}
  on -->|yes| robot["Robot flow:<br/>guard, approvals, OpenAI"]
  on -->|no| env["Envelope: waits for a connection"]
  en -->|no| pg{"Apple sheet enabled, supported<br/>and allowed by Screen Time?"}
  pg -->|yes| on2{"Online?"}
  on2 -->|yes| sheet["Apple Image Playground sheet,<br/>result approval over CloudKit if required"]
  on2 -->|no| asleep["Robot asleep"]
  pg -->|no| asleep
```

## Rules for the seams

1. **The core decides, the adapter delivers.** Adapters never contain policy. "Does this kid need approval?" is answered by the family core; the adapter only carries the request.
2. **Every port has a "nothing" outcome that the UI already knows how to show.** No adapter may throw an error that reaches a kid.
3. **Money only flows through the server adapter.** No fallback can spend or grant a credit.
4. **A child's voice never leaves the device.** The transcriber port has no network adapter.
5. **Capability changes are live.** When the record changes (back online, model finished downloading), the robot state and outbox react without a restart.
6. **Each fallback is tested by forcing the capability record.** The test suite runs the full approval and sticker flows with every combination of network, server, Apple Intelligence and credits.
