---
name: http-post
description: Post a JSON body to an arbitrary URL. Used for generic webhooks (Slack incoming, Zapier, custom APIs).
version: 0.1.0
metadata:
  openclaw:
    requires:
      bins:
        - curl
        - jq
---

Use this skill to send a JSON POST to any URL the user specifies.

## Inputs
- `url` — destination URL (required)
- `body` — JSON object or string to post (required)
- `headerSecret` — optional name of a ProjectSecret to add as `Authorization: Bearer <value>`

## Procedure
1. If `headerSecret` is provided, confirm the corresponding env var is set. If not, stop and report.
2. Use `exec_shell`:
   ```
   curl -sS -X POST "$URL" \
     -H 'Content-Type: application/json' \
     ${AUTH_HEADER:+-H "Authorization: Bearer $AUTH_HEADER"} \
     -d "$BODY"
   ```
3. Inspect status code; report success/failure to the caller.
4. Call `end_skill` with a short summary.
