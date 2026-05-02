# Phase 1: Run-lifecycle substrate + mobile primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 1-run-lifecycle-substrate-mobile-primitives
**Areas presented:** Ledger ambition, Existing activity-log fate, Mobile philosophy, PWA identity
**Areas selected by user:** Mobile philosophy

---

## Gray Area Selection

| Area | Description | Selected |
|------|-------------|----------|
| Ledger ambition | Forensic-level event capture vs. summary-level vs. middle path. Affects what 01-01 actually emits. | |
| Existing activity-log fate | When `AgentRunEvent` lands: replace `AgentActivityLog` entirely / parallel-write / projection. Affects 01-01 scope + AUD-02 in P3. | |
| Mobile philosophy | Faithful adaptation vs. selective redesign vs. phone-first. Sets ambition for vaul Drawer / BottomSheet adoption in P1 + ripples into P3, P5. | ✓ |
| PWA identity | Single Co-Op app on home screen vs. per-project installable apps. Decides plan 01-04's manifest design. | |

**User's choice:** Mobile philosophy only. Other three areas were resolved with Claude-discretion defaults documented in CONTEXT.md `<decisions>` → "Claude's Discretion".

---

## Mobile philosophy

### Q1 — Mobile design ambition for M1

| Option | Description | Selected |
|--------|-------------|----------|
| Faithful adaptation | Same screens humans use at desk, made phone-friendly. DESIGN.md aesthetic preserved as-is. Lowest design lift; risk that some surfaces feel cramped. | |
| Selective redesign | Hot paths (plan review, run audit, kanban, chat) get phone-tuned layouts; secondary surfaces (settings, agent pages) are faithful adaptation. Aesthetic mostly preserved with density reduced where ergonomics demand. | ✓ |
| Phone-first redesign | Treat phone as a distinct experience: rethink kanban, plan review, run audit from a thumb-first model. Larger lift; would push some MOB items into a longer arc. | |

**User's choice:** Selective redesign.
**Notes:** Aligns with the M1 inflection ("co-op runs co-op on phone"). Hot paths get phone-tuned; secondary surfaces are faithful adaptation.

### Q2 — Density tradeoff on hot-path screens

| Option | Description | Selected |
|--------|-------------|----------|
| Density preserved | DESIGN.md density survives — just smaller everything. Touch targets reach 44pt minimum, but content stays packed. Ships fastest; risk: cramped on 375px. | ✓ |
| Density dialed back | More whitespace, larger fonts, more breathing room on phone hot paths. Terminal aesthetic preserved (carbon-black + emerald, system-ui), but phone gets an explicit lower-density variant. | |
| Mobile-aesthetic override | Phone hot paths get distinct visual treatment beyond density tuning. Riskier (DESIGN.md drift); only if you want phone to feel meaningfully different. | |

**User's choice:** Density preserved.
**Notes:** Strong opinion against introducing a mobile-only typography scale. 44pt touch targets reached via padding; line-heights / font-sizes stay desktop. Risk of cramped 375px accepted in service of DESIGN.md fidelity.

### Q3 — Navigation pattern on phone

| Option | Description | Selected |
|--------|-------------|----------|
| Drawer only | Sidebar collapses into a vaul Drawer triggered by hamburger in topbar. Single mental model with desktop. Closer to terminal/CLI feel. Adds taps to reach hot paths. | |
| Bottom tab bar | 5 primary destinations as a fixed bottom tab bar. Reduces taps to one for hot paths. Standard iOS/Android idiom — risk: feels 'appish' against the CLI aesthetic. | |
| Hybrid | Bottom tab bar for global destinations + Drawer for project-scoped sub-navigation (boards, agents, members, settings). Best of both — more code to build. | ✓ |

**User's choice:** Hybrid.
**Notes:** Bolder than ROADMAP MOB-03 (which was Drawer-only). Planner must add the bottom tab bar as a sub-deliverable inside plan 01-04 (or split into 01-04a Drawer+BottomSheet / 01-04b BottomTabBar).

### Q4 — Bottom tab bar destinations

| Option | Description | Selected |
|--------|-------------|----------|
| Projects (hub) | Project switcher / hub home. Most likely the default tab. | |
| Plans | Pending-plans queue across all projects — the dogfood-loop landing surface. Strong candidate. | ✓ |
| Runs | Recent runs across all projects — the audit landing surface. | ✓ |
| Chat | Global chat inbox — unread mentions, DMs, project rooms. | ✓ |

**User's choice:** Plans, Runs, Chat (3 tabs).
**Notes:** Projects switcher relegated to Drawer; profile/settings live in Drawer; cross-project notifications fold into push routing. **Open detail (resolved by Claude discretion):** tabs are current-project-scoped with a "Pick a project" empty state when none is selected, rather than global-aggregate views.

### Continue / Close

| Option | Description | Selected |
|--------|-------------|----------|
| More questions | Drill further — topbar contents, push deep-link landing, mobile animations, project switcher placement. | |
| I'm ready for context | Close the discussion. Other gray areas get Claude-discretion defaults. | ✓ |

**User's choice:** Close — write CONTEXT.md.

---

## Claude's Discretion

User did not select these gray areas; defaults documented in CONTEXT.md `<decisions>` → "Claude's Discretion":

- **D-06 Ledger ambition:** Middle path — full-fidelity event capture, two-tier retention (metadata indefinite, full payloads 7–14 days configurable). Aligns with SUMMARY.md convergence.
- **D-07 Existing `AgentActivityLog` fate:** Parallel-write during M1; project to `AgentRunEvent` post-M1. P1 dual-writes; P3 reads from new ledger; v2 retires legacy writer.
- **D-08 PWA identity:** Single Co-Op app on home screen. One manifest at root, project switcher inside the app. Per-project installable surfaces deferred to v2 / M2.

Plus implicit:

- **D-05 Tab scoping:** current-project-scoped with "Pick a project" empty state when none selected.
- **Topbar contents on phone:** hamburger + project name; profile/account menu placement deferred to P3/P5 polish.
- **PWA icon:** placeholder in P1; final design before M2 marketing.

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`:

- Per-project PWA / installable surfaces — v2 or M2 marketing.
- Global-aggregate Plans/Runs/Chat tabs — if multi-project usage emerges.
- Topbar polish on phone — P3/P5.
- PWA icon set — final design before M2 marketing.
- Global notifications inbox — folded into push for M1; revisit if push proves insufficient.
- Mobile-only animations beyond vaul defaults — out of M1.
- `AgentActivityLog` retirement migration — v2.
