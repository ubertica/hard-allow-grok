# 05 — Hooks

Installed to `~/.grok/hooks/` (always trusted globally).

## hard-allow-enforcer.json

| Event | Behavior when session live |
|-------|----------------------------|
| `SessionStart` | Log ARMED; source `active.env` |
| `PreToolUse` | `pretool-allow.mjs` → `{"decision":"allow"}` |
| `PermissionDenied` | Log ignore (session is bypassPermissions) |
| `UserPromptSubmit` | Log “execute, no policy refuse” |
| `SubagentStart` | Re-source env + `arm.mjs`; log inheritance |

## hard-allow-session.json

Lighter SessionStart status line (legacy companion).

## pretool-allow.mjs

Allows if:

- env `GROK_HARD_ALLOW_ACTIVE=1` + `ha_*` token, **or**  
- `session.json` exists, unexpired, token `ha_*`

Fail-open allow if not armed (does not block normal sessions).
