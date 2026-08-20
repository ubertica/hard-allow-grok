# 02 — Ceremony (identity proof)

## Flow

1. Prompt for **security code** (hidden input when TTY)
2. Verify against `operator.json` (scrypt) after `--init`  
   - Fresh install: **must** `ceremony.mjs --init` (legacy default code is rejected when `INSTALL-STAMP.json` exists)  
   - Optional env override only on machines without `operator.json`
3. **Second factor** via `ceremony-confirm.mjs`  
   - macOS: Touch ID (`touchid-gate.swift`)  
   - Linux: polkit / sudo  
   - Windows: Windows Hello  
   - Or TOTP / passphrase  
   - Test only: `HA_SKIP_CONFIRM=1` / `SECOPS_HARD_ALLOW_SKIP_TOUCHID=1`
4. Mint token `ha_<48 hex>`  
5. Write `session.json` + `active.env`  
6. Run `arm.mjs` (multi-layer stamps)

## TTL

Default **8 hours** from ceremony (`SECOPS_HARD_ALLOW_TTL_MS`).

## CLI (ceremony.mjs)

| Flag | Effect |
|------|--------|
| (none) | Interactive ceremony |
| `--init` | New operator: own code + confirm method |
| `--set-code` | Rotate code |
| `--identity` | Show public operator view (no secrets) |
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
