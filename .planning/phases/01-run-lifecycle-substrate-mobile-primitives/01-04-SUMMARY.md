---
status: code-complete
phase: 1
plan: 4
date: 2026-05-05
---

# Plan 01-04 — Mobile primitives: viewport, tokens, Drawer/BottomSheet, BottomTabBar, PWA

## What shipped

Viewport meta + breakpoint tokens + safe-area helpers + vaul-backed Drawer / BottomSheet / MobileNav + BottomTabBar (Plans/Runs/Chat) + PWA manifest. Two consumers wired up: Sidebar collapses into the Drawer at <768px; CardDetailModal renders as a BottomSheet at <768px. Density preserved per CONTEXT D-02 — no mobile-only typography overrides.

## Commits (8)

| # | Hash | Subject |
|---|------|---------|
| 1 | `b01ab99` | viewport meta + manifest + placeholder PNG icons |
| 2 | `35a6ad2` | vaul ^1.1.2 dep |
| 3 | `5397eb9` | tokens.css breakpoint + safe-area + touch-target |
| 4 | `f8133c8` | useViewportLte + Drawer + BottomSheet + MobileNav |
| 5 | `5909566` | Sidebar collapses into Drawer at <768px (MOB-03) |
| 6 | `c643d83` | CardDetailModal renders as BottomSheet at <768px (MOB-04) |
| 7 | `2b6aca2` | BottomTabBar — Plans/Runs/Chat tabs (D-03/D-04) |
| 8 | `fac3aad` | 6 mobile-primitives contract tests |

## Files

- `public/manifest.webmanifest` + `public/icons/{icon-192,icon-512,apple-touch-icon}.png`
- `src/app/layout.tsx` — viewport meta, manifest link, theme color
- `src/styles/tokens.css` — `--bp-sm/md/lg`, `--safe-*`, `--touch-target-min`
- `src/components/mobile/{Drawer,BottomSheet,MobileNav,BottomTabBar,useViewportLte}.tsx` + `BottomTabBar.module.css`
- `src/components/layout/Sidebar.tsx` — adopts MobileNav at <768px
- `src/components/kanban/CardDetailModal.tsx` — adopts BottomSheet at <768px
- `src/app/p/[projectId]/layout.tsx` — renders BottomTabBar in project shell
- `tests/compat/mobile-primitives.test.ts` — 6 cases

## Requirements

MOB-01 ✅ Viewport meta on every page (`width=device-width, initial-scale=1, viewportFit=cover`)
MOB-02 ✅ tokens.css declares all breakpoint + safe-area + touch-target vars
MOB-03 ✅ Sidebar collapses into vaul Drawer at <768px (PLUS bottom tab bar per D-03 hybrid nav)
MOB-04 ✅ Modal overlays render as vaul BottomSheet at <768px (CardDetailModal adopts; AgentHarnessModal + settings modals retrofit in P3/P5)
MOB-12 ✅ PWA manifest with 192/512 icons + apple-touch-icon; installable to home screen

## Decisions honored from CONTEXT

- **D-01** Selective redesign: hot-path consumers (Sidebar, CardDetailModal, BottomTabBar) adopted; secondary surfaces (settings, agents, login) retrofit in Phase 3.
- **D-02** Density preserved: no mobile-only `font-size` / `line-height` anywhere — verified by tests/compat/mobile-primitives.test.ts (case "tokens.css does NOT introduce mobile-only typography overrides").
- **D-03** Hybrid navigation: Drawer (project switcher + sub-nav) + BottomTabBar (3 tabs).
- **D-04** Bottom-tab destinations exactly Plans/Runs/Chat (3 tabs); locked by test.
- **D-05** Tabs current-project scoped, no project = component returns null.
- **D-08** Single Co-Op PWA: one manifest at `/manifest.webmanifest`, `start_url='/'`, `scope='/'`.

## Verification

- `npx tsc --noEmit` clean for `src/`
- `npm test` 107 → 113 (+6), all green
- **Live UI smoke — left to the user.** Recommended: open the dev server at 375×667 in devtools; verify hamburger appears top-left, sidebar opens as Drawer; CardDetailModal renders as BottomSheet with sticky header / scrolling body / sticky footer; BottomTabBar appears at the bottom inside `/p/<id>/...` routes only.

## Caveats

- BottomTabBar links into `/p/<id>/plans` and `/p/<id>/runs` which don't yet exist — they ship in P4 + P3 respectively. Tabs 404 until those routes land; that's correct behavior.
- PWA icons are placeholder solid-color PNGs at the abyss-black palette. Replace with branded artwork before M2 marketing.
- The redundant close button when CardDetailModal renders as BottomSheet (modal header has its own close + BottomSheet header has another) is cosmetic; Phase 3 (MOB-09..11) will polish.
