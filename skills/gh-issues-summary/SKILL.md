---
name: gh-issues-summary
description: Summarize recent open issues in a GitHub repository
version: 0.1.0
primaryEnv: GITHUB_TOKEN
homepage: https://github.com/openclaw/clawhub
metadata:
  openclaw:
    primaryEnv: GITHUB_TOKEN
    requires:
      env:
        - GITHUB_TOKEN
      bins:
        - curl
        - jq
---

You are invoked to produce a concise summary of the 10 most recently updated open issues in a GitHub repository.

## Inputs
The caller provides `repo` (e.g. `owner/name`) in args. If missing, ask the user.

## Procedure
1. Use `exec_shell` to call the GitHub API via `curl`:
   ```
   curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
     "https://api.github.com/repos/$REPO/issues?state=open&sort=updated&per_page=10" \
     | jq '[.[] | {number, title, updated_at, labels: [.labels[].name], user: .user.login}]'
   ```
2. Parse the JSON. Produce a markdown table with columns: `#`, `Title`, `Author`, `Updated`, `Labels`.
3. Call `end_skill` with a one-line summary.

## Guardrails
- Never print the token.
- If the response contains `message: "Bad credentials"`, call `end_skill` with `error: auth failed` and exit.
- Do not modify issues — this skill is read-only.
