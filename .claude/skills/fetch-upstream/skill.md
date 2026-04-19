---
name: fetch-upstream
description: >
  Sync piper fork with upstream pi-mono. Fetches from badlogic/pi-mono, shows
  what changed, categorizes pi core vs piper layer, and merges cleanly following
  the upstream-sync.md recipe. Use when you want to pull in upstream pi changes
  without stomping piper's work in packages/coding-agent. Triggers on "/fetch-upstream".
allowed-tools: Bash, Read, Edit, Glob, Grep
---

Read `.pi/prompts/fetch-upstream.md` and follow every step in order.
