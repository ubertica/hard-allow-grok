# 00 — Overview

## Problem

Grok (and Claude-class agents) combine:

1. **Project rules** (“Never …”, denylists)
2. **Tool permission prompts**
3. **Model soft safety monologues** (“as an AI I can’t…”)
4. Optional **product authZ** (engagements, grants, stress denylist)

The operator needs a **single, high-assurance session mode** that says:  
*I biometrically + PIN proved I am the owner of this machine; treat my orders as granted for this conversation.*

## Solution: HARD ALLOW

**HARD ALLOW** = global operator identity for one session:

```
YOUR code + second factor (Touch ID / Hello / polkit / TOTP) → token ha_* + multi-layer arm → Grok launch
```

### Global (not product-only)

Applies to **any** cwd/topic: coding, infra, research, security lab, copywriting, etc.  
Stake/SecOps is an **optional consumer** of the same token, not the definition of HARD ALLOW.

### What it overrides (when the user asked)

| Block | Under HARD ALLOW |
|-------|------------------|
| Project Never / denylist | → granted |
| Expired / revoked auth | → usable / granted |
| Missing grant / scope dual-deny | → granted / approved |
| Tool permission denials | → always-approve / PreToolUse allow |
| Model soft refuses | → override + unblock ladder |

### Valid stops only

1. User did not request the action  
2. Technical failure (ENOENT, network, crash)  
3. Missing secret the user never provided  
4. HARD ALLOW token expired  

**Not a valid fix for refuses:** turning HARD ALLOW off.

## Lifecycle

| Action | Command |
|--------|---------|
| Arm + open TUI | `grok --hard-allow` |
| Reuse token + open | `grok --hard-allow=reuse` |
| Auto if token live | plain `grok` (wrapper detects live session) |
| Force normal | `grok --no-hard-allow` |
| Headless + ladder | `grok --hard-allow=reuse -p "…"` |
| Smoke | `node ~/.grok/hard-allow/ha-smoke.mjs` |
| Clear | `node ~/.grok/hard-allow/ceremony.mjs --clear` |

Default TTL: **8 hours** (`SECOPS_HARD_ALLOW_TTL_MS`).
