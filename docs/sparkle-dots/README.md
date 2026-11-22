# Sparkle Dots — architecture

Sparkle Dots is a calm dot-grid drawing toy for young kids, with stickers, a few play activities, a notebook, and parental controls. This folder is the design record for the native app (iOS and iPadOS first, Android and Fire tablets second). The web version in `/sparkle-dots/` is the design lab, not the product.

| Doc | What it covers |
|---|---|
| [01 — Context](01-context.md) | C4 level 1: the people, the app, and every outside system it talks to |
| [02 — Containers](02-containers.md) | C4 level 2: the app, the portable family core, local storage, iCloud, the household server |
| [03 — Sync](03-sync.md) | What syncs where, the outbox, conflicts, and the key sequences (keep, approvals, credits) |
| [04 — iOS modules](04-ios-modules.md) | Swift package boundaries, their contracts, and the allowed dependencies |
| [05 — Seams and fallbacks](05-seams-fallbacks.md) | Where each core lives, and how the full experience degrades to on-device and offline fallbacks |
| [06 — Portable family core](06-family-core.md) | The TypeScript core shared by iOS, Android, the server and the web console |
| [07 — Screen flows](07-screen-flows.md) | Every mode of the app: setup, splash, draw, play, notebook, robot, grown-up area |

## The decisions these docs encode

- **v1 scope:** dot drawing, stickers, four activities (cars with slot-car controls, animals on the lines, a zoo in the shapes, a garden to water), the notebook, and parental controls.
- **Draw | Play** is a mode slider along the top. In Play the activity palette replaces the drawing palette. Palettes have at most three tabs.
- **Tins** are themed collections: palette tins (Storybook colors, rainbows, watercolor) and sticker tins by theme. A drag draws dot lines with any regular color and paints with a watercolor, so there is no separate tool to pick.
- **Keeping is a choice.** The sheet she's on survives app restarts but only reaches the notebook when she taps keep. Unkept sheets go to a scrap pile for 30 days, synced.
- **The notebook** groups kept pages into piles by gaps in time. It's reached by a button from the drawing surface and returned from by opening a page. Inside, piles spread into grids by tap or pinch.
- **The front door** is a profile splash: a tile per kid and a grown-up door. Profiles belong to the household, so every kid works on every device. "Always open as Juni" skips the splash on her iPad.
- **Grown-up door:** hold to open, then Face ID on a parent's own phone, approval from a parent's phone on a kid's device, or the household PIN offline.
- **Growing up:** a kid's stage (little, middle, older) sets dot spacing, target sizes, number of colors and sticker slots, and which AI features are on. A notice reaches guardians when the child enters their birth quarter. The app is not involved in birthdays.
- **Grid:** each page keeps the grid it was born with. New pages use comfortable spacing for the device and the kid's stage. A page too big for the current screen gets plus and minus zoom, a minimap, and two-finger pan. That's a fallback for finishing something on another device, not the main path.
- **AI:** robot stickers (OpenAI through the household relay, paid per credit, both approval levels) and Apple's Image Playground sheet (free, Apple devices with Apple Intelligence). Voice is on-device only. A copyright guard runs on-device first where possible and always on the server for paid requests.
- **Money stays on the server.** Credits are reserved on approval and charged only when an image comes back. Everything that doesn't call a model runs without the server.
- **Offline:** the core never needs a network, and a kid never sees an error. Missing capabilities are hidden or shown as one of the robot's states.
- **Cross-platform:** native UI on each platform (SwiftUI, then Kotlin and Compose). The family core (households, approvals, stages, credits logic) is portable TypeScript so Android, the server and a web console share it.
