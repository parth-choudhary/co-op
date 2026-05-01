# Screenshots

Drop PNGs here with the exact filenames below. The top-level `README.md` references them in this order — if a file is missing the README still renders, but the slot stays empty.

| Filename | What to capture |
|---|---|
| `01-projects.png` | Project hub at `/` — the "Your Projects" grid with at least 2 cards. |
| `02-overview.png` | Project overview at `/p/<id>` — boards list, About section, recent activity. |
| `03-board.png` | Kanban board at `/p/<id>/boards/<boardId>` — three or four columns, a few cards (one with assignees and labels). |
| `04-card.png` | Card detail modal open on a card with an agent comment thread. |
| `05-agents.png` | Agents page at `/p/<id>/agents` — at least one agent of each role (CTO, PM, Developer). |
| `06-harness.png` | Agent harness modal — `Capabilities` or `Soul` tab is the most interesting. |
| `07-chat.png` | Chat at `/p/<id>/chat` — a channel with a human and an agent talking; mention autocomplete visible if possible. |
| `08-login.png` | Login page (optional — only if you want a hero shot of the auth flow). |

## Capture tips

- Window size **1440×900** keeps file sizes reasonable and matches the design system breakpoints.
- Dark theme is the default; the design system is tuned for it. Keep it dark.
- On macOS: `Cmd+Shift+4`, then `Space`, then click a window — captures with a clean shadow. Crop the shadow if you don't want it.
- Compress before committing: `pngquant --quality=70-85 *.png --ext .png --force` (or drop them into <https://tinypng.com>).
