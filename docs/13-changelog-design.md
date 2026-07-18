# 13 — Design history (how we got here)

## Policy evolution

1. **SecOps authZ** — engagement ∪ grant, USER ALLOW for dual-deny, hard denylist  
2. **HARD ALLOW (product)** — Touch ID + PIN to overwrite hard denylist only  
3. **Rewrite pack** — expired/revoked/all blocks → granted in engagement-auth  
4. **Global session (Grok)** — not Stake-only; whole conversation  
5. **Model soft refuse override** — banned monologues; unblock ladder  
6. **Multi-layer arm** — rules + AGENTS + hooks + always-approve + system-prompt-override  
7. **Hardening** — headless ladder auto, subagent inherit, zshrc, ha-smoke  

## Incidents fixed

| Incident | Lesson |
|----------|--------|
| Empty `PASS_ARGS` + `set -u` | Branch on array length |
| Wrapper wrote through symlink → binary became bash | Regular file wrapper; `grok-real` → Mach-O only |
| Same hash, path SIGKILL | macOS Taskgated path poison after invalid file at path |
| Agent inventory of “can’t” under HA | Project Never vs HA priority; stronger rules + Agents.md override language |
| Explanation without tools when asked | Operator prompts force tools; HA law prefers execution |

## Future backlog (not all shipped)

- Local model fallback endpoint  
- PIN rate-limit  
- Heartbeat re-Touch-ID  
- Auto-update reinstall watcher  
- pause/resume lifecycle without full clear  
