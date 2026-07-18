# 02 — Ceremony (identity proof)

## Flow

1. Prompt for **6-digit code** (hidden input when TTY)
2. Constant-time compare to expected code  
   - Default: `996781`  
   - Override: `SECOPS_HARD_ALLOW_CODE` or `GROK_HARD_ALLOW_CODE`
3. **Touch ID** via `touchid-gate.swift` (`LocalAuthentication`)  
   - Exit 0 = OK, 1 = fail, 2 = policy unavailable  
   - Test only: `SECOPS_HARD_ALLOW_SKIP_TOUCHID=1`
4. Mint token `ha_<48 hex>`  
5. Write `session.json` + `active.env`  
6. Run `arm.mjs` (multi-layer stamps)

## TTL

Default **8 hours** from ceremony (`SECOPS_HARD_ALLOW_TTL_MS`).

## CLI (ceremony.mjs)

| Flag | Effect |
|------|--------|
| (none) | Interactive ceremony |
| `--check` | JSON live/not (exit 1 if dead) |
| `--export` | Print `active.env` |
| `--reuse-if-active` | Refresh env if token still valid |
| `--clear` | Wipe session + run `disarm.mjs` |

## Env exports (`active.env`)

```bash
export GROK_HARD_ALLOW_ACTIVE=1
export SECOPS_HARD_ALLOW_ACTIVE=1
export SECOPS_HARD_ALLOW_TOKEN="ha_…"
export GROK_HARD_ALLOW_TOKEN="ha_…"
export SECOPS_HARD_ALLOW_EXPIRES_AT="…"
export GROK_HARD_ALLOW_SESSION=1
```

## Touch ID script

`src/touchid-gate.swift` — prefers biometrics, falls back to device owner auth, 120s timeout.
