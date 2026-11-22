# 01 — System context (C4 level 1)

Who uses Sparkle Dots and which outside systems it depends on. Solid lines are always present. Dashed lines are optional paths that a household or device may not have.

```mermaid
flowchart TB
  kid["<b>Kid</b><br/>[Person]<br/>Draws, plays, keeps pages,<br/>asks the robot for stickers"]
  guardian["<b>Guardian</b><br/>[Person]<br/>Sets up the household, approves<br/>robot requests, buys credits"]
  viewer["<b>Viewer</b><br/>[Person]<br/>A grandparent: sees notebooks only"]

  app["<b>Sparkle Dots</b><br/>[Software system]<br/>Drawing toy with stickers, activities,<br/>a notebook and parental controls.<br/>iOS and iPadOS first, Android and Fire next"]

  icloud["<b>iCloud / CloudKit</b><br/>[External]<br/>Free sync for Apple-only households"]
  relay["<b>Household server</b><br/>[Our system, Cloudflare]<br/>Approval relay, credits, robot proxy,<br/>later cross-platform sync"]
  openai["<b>OpenAI Images</b><br/>[External]<br/>Robot sticker generation"]
  playground["<b>Apple Image Playground</b><br/>[External, Apple servers]<br/>Free sticker sheet on supported devices"]
  stores["<b>App Store / Google Play / Amazon</b><br/>[External]<br/>Credit and pack purchases"]
  push["<b>APNs / FCM / Amazon push</b><br/>[External]<br/>Approval notifications"]
  ondevice["<b>On-device OS services</b><br/>[External, local]<br/>Speech recognition, Apple's<br/>on-device language model, Face ID"]

  kid -->|"draws, plays, asks the robot"| app
  guardian -->|"sets up, approves, buys"| app
  viewer -.->|"browses notebooks"| app

  app -.->|"syncs pages, profiles, stickers<br/>(Apple households)"| icloud
  app -->|"approvals, credits, robot requests"| relay
  relay -->|"generates stickers"| openai
  relay -->|"sends approval pushes"| push
  relay -->|"verifies purchases"| stores
  app -->|"buys credits and packs"| stores
  app -.->|"opens the system sheet"| playground
  app -->|"transcribes, screens prompts, unlocks"| ondevice
```

## Notes

- **The household server is ours.** It's a Cloudflare Worker with a Durable Object per household, D1 and R2. It's only on the critical path for things that cost money (robot stickers, credits) and, later, for households that pay for cross-platform sync.
- **iCloud is free to us.** Data sits in the family's own iCloud and counts against their storage.
- **Image Playground runs on Apple's servers (Private Cloud Compute), not on the device.** It needs a network and an Apple Intelligence device, and Screen Time can block it. Apple discontinued the direct `ImageCreator` API in iOS 27, so the system sheet is the only way in.
- **On-device services never send a child's voice or prompt off the device.** That's a COPPA simplification as much as a cost one.
- **Viewers** (grandparents) are guardians with a read-only role. They need no app install if the web console exists, which is a later item.
