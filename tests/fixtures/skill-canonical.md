---
name: canonical-reference
description: Canonical SKILL.md fixture — if this stops parsing, the ClawHub format has drifted.
version: 1.2.3
primaryEnv: GITHUB_TOKEN
homepage: https://clawhub.ai/skills/canonical-reference
os:
  - macos
  - linux
metadata:
  openclaw:
    primaryEnv: GITHUB_TOKEN
    always: false
    skillKey: canonical-reference
    requires:
      env:
        - GITHUB_TOKEN
        - OPENAI_API_KEY
      bins:
        - curl
        - jq
      anyBins:
        - gh
        - hub
      config:
        - .githubconfig
---

# Canonical Reference Skill

Body content. Contains examples, guidance, and guardrails.

## Procedure
1. Fetch data from GitHub.
2. Format it.
3. Return.
