# 07 — Screen flows

Every mode of the app, from first launch to the grown-up area. iPad and iPhone share the same flows; layout differences are listed at the end.

## App map

```mermaid
flowchart TB
  launch(["Launch"]) --> setup{"Household set up<br/>on this device?"}
  setup -->|no| first["First-run setup<br/>(a grown-up)"]
  setup -->|yes| lock{"'Always open as'<br/>a kid?"}
  first --> lock
  lock -->|yes| kid["Kid space<br/>(that kid's working sheet)"]
  lock -->|no| splash["Profile splash<br/>a tile per kid + grown-up door"]
  splash -->|"tap a kid"| kid
  splash -->|"hold the grown-up door"| unlock["Unlock"]
  kid -->|"notebook button"| nb["Notebook"]
  nb -->|"open a page"| kid
  nb -->|"grown-up door (hold)"| unlock
  nb -->|"back to profiles"| splash
  unlock -->|"Face ID, phone approval or PIN"| gu["Grown-up area"]
  gu -->|"done, app backgrounds,<br/>or a minute idle"| splash
```

## First-run setup (a grown-up)

```mermaid
flowchart LR
  a["'A grown-up sets this up'"] --> b{"Join or create?"}
  b -->|create| c["Sign in<br/>(iCloud account on Apple,<br/>or Apple / Google / email)"]
  b -->|join| j["Scan pairing code from<br/>a guardian's phone"]
  c --> d["Add a kid<br/>nickname, avatar,<br/>birth year and quarter"]
  d --> e["Set the household PIN"]
  e --> f{"Whose device is this?"}
  j --> f
  f -->|"a kid's"| g["Always open as that kid"]
  f -->|"shared or mine"| h["Open to the profile splash"]
  g --> i["Guided Access walkthrough<br/>(optional)"]
  h --> i
  i --> k(["Hand it over:<br/>the kid's dot page"])
```

## Kid space: Draw and Play

The mode slider along the top switches between Draw and Play. The rails swap with it; the page stays.

```mermaid
flowchart TB
  subgraph draw["Draw mode"]
    direction TB
    d1["Page<br/>one finger draws dot lines,<br/>watercolor paints, taps fill"]
    d2["Left rail: sticker tins<br/>(up to 3 tabs, scroll)"]
    d3["Right rail: palette tins<br/>Storybook, rainbows, watercolor"]
    d4["Corner: undo, keep,<br/>new page, notebook"]
    d5["Robot (in a sticker tin)"]
  end
  subgraph play["Play mode"]
    direction TB
    p1["Activity palette replaces<br/>the drawing rails"]
    p2["Cars: place on the road,<br/>hold to go, mind the curves"]
    p3["Animals: run the lines<br/>at their own speeds"]
    p4["Zoo: animals wander<br/>inside their shape"]
    p5["Garden: plant, water,<br/>watch it grow"]
  end
  draw <-->|"mode slider"| play
  d5 --> robot["Robot sheet"]
  d4 -->|"new page"| np["Fresh sheet<br/>(old one to the scrap pile<br/>unless kept)"]
  d4 -->|"keep"| kept["Page flies into the notebook<br/>(wiggles if unchanged)"]
  p1 --> p2 & p3 & p4 & p5
```

- **Keep** stays in the same spot at every stage and never moves into a tin.
- **New page** never asks anything. An unkept sheet goes to the scrap pile, and undo right afterward brings it back.
- **Play mode** saves activity state with the page (garden growth, where zoo animals live).

## Robot sticker sheet

```mermaid
flowchart LR
  r0["Robot awake"] -->|tap| r1["Listening<br/>mic (on-device) or a grown-up types<br/>[cancel] [draw]"]
  r1 -->|draw| r2{"Guard"}
  r2 -->|"named character"| r3["Redirect: 2–3 original<br/>suggestions as chips"]
  r3 --> r1
  r2 -->|ok| r4{"Needs a grown-up<br/>or offline?"}
  r4 -->|yes| r5["Envelope: robot waits<br/>sheet closes, she keeps drawing"]
  r5 -->|"approved, online"| r6
  r4 -->|no| r6["Robot drawing at the easel<br/>[cancel]"]
  r6 --> r7["Sticker shown<br/>[discard] [retry] [place]"]
  r7 -->|place| r8(["Sticker in her tin,<br/>sticker tool selected"])
  r7 -->|retry| r6
  r7 -->|discard| r0
```

## Notebook

```mermaid
flowchart TB
  t["Table of piles<br/>(newest at the front; time band for parents)"]
  t -->|"tap or pinch open a pile"| g["Pile spread into a grid"]
  g -->|"tap or pinch closed"| t
  g -->|"tap a page"| pg["Page, full screen<br/>swipe between pages"]
  pg -->|"draw on it"| ks(["Becomes the working sheet<br/>(kid space)"])
  pg -->|"send to Photos"| ph["Saved once<br/>(check mark; repeats do nothing)"]
  pg -->|"tear out"| bin["Parent-only recovery bin"]
  t -->|"scrap pile at the edge"| sp["Unkept sheets, 30 days"]
  sp -->|"tap one"| ks
  t -->|"hold a pile, drag"| mv["Move or merge piles"]
  g -->|"hold a page, drag out"| mv2["Move it to another pile<br/>or start a new one"]
```

## Big page on a smaller screen (fallback only)

```mermaid
flowchart LR
  o["Open a page"] --> f{"Fits at comfortable spacing<br/>for this device and stage?"}
  f -->|yes| n(["Normal page"])
  f -->|no| w["Whole view<br/>page scaled to fit; [+] shown"]
  w -->|"[+]"| c["Close view<br/>comfortable dots, minimap, [−]"]
  c -->|"two-finger drag or<br/>drag the minimap box"| c
  c -->|"[−]"| w
```

## Grown-up area

```mermaid
flowchart TB
  entry{"Which device?"}
  entry -->|"parent's own phone"| fid["Face ID / Touch ID / passcode"]
  entry -->|"kid's device, online"| ask["Request goes to guardians' phones"]
  entry -->|"kid's device, offline"| pin["Household PIN"]
  ask -->|"a guardian approves with Face ID"| home
  fid --> home
  pin --> home
  push(["Approval notification"]) -->|"Face ID"| appr

  home["Grown-up home"] --> appr["Requests<br/>prompts: 'spend one credit?'<br/>results: 'send to her device?'"]
  home --> kids["Kids<br/>stage, colors, sticker slots,<br/>robot on/off, Apple sheet on/off,<br/>filtering level, dot spacing"]
  home --> nbs["Notebooks<br/>every kid's piles, dates,<br/>recovery bin, send a pile to Photos"]
  home --> dev["Devices<br/>pair a device, 'always open as',<br/>capability status per device"]
  home --> cred["Credits and packs<br/>(store confirmation on top)"]
  home --> logv["Log<br/>prompts, redirects, results,<br/>who approved what"]
  home --> hh["Household<br/>guardians and viewers, PIN,<br/>sync status, delete data"]
  home --> notices["Notices<br/>quarter check-in, sync problems,<br/>robot out of paint"]
```

### Filtering levels (per kid, set in Kids)

| Level | Robot prompt | Robot result | Apple sheet result |
|---|---|---|---|
| Strictest (default for little) | Guardian approves ("spend one credit?") | Guardian approves ("send to her device?") | Guardian approves |
| Middle | Sent automatically if it passes the guard | Guardian approves | Sent automatically |
| Open | Automatic | Automatic | Automatic |
| Off | Robot hidden | — | Sheet hidden |

The log records everything at every level.

### Quarter check-in

```mermaid
flowchart LR
  q["Kid's birth quarter begins"] --> n["Notice to guardians:<br/>'Juni's settings are due for a look'"]
  n --> v["Side-by-side: current stage<br/>and the next one"]
  v -->|accept| s["Stage updated"]
  v -->|"not yet"| z["Snoozed until next year's quarter"]
  n -.->|"no guardian opens the app<br/>this quarter"| later["Shown at the next open"]
```

## iPad and iPhone layouts

| | iPad (landscape) | iPhone (landscape) | iPhone (portrait) |
|---|---|---|---|
| Rails | One per side: stickers left, palettes right | One per side, narrower | One strip along the bottom |
| Tins | Above each rail | Above each rail | At the start of the strip |
| Corner buttons | Top right | Clustered in one corner | Top row |
| Mode slider | Top center | Top center | Top |
| Dots | Comfortable spacing for the stage; about 14 × 12 at middle | About 14 × 8 at middle; more on a Pro Max | Rotated grid |
| Grown-up area | Split view | Standard stacked navigation | Standard stacked navigation |
