# Security

## What this repo never contains

- Live `ha_*` session tokens
- `session.json`, `active.env`, `ARMED`, `operator.json`
- Your PIN / TOTP secret (those live only on *your* machine after `--init`)
- API keys, wallet keys, sink keys

If you find a token in git history, rotate it and open an issue.

## Ceremony on a new machine

```bash
node ~/.grok/hard-allow/ceremony.mjs --init   # YOUR code + YOUR second factor
node ~/.grok/hard-allow/ceremony.mjs          # arm
```

Fresh installs refuse the legacy default code. You **must** `--init`.

Second factor (auto by OS):

| OS | Default confirm |
|----|-----------------|
| macOS | Touch ID |
| Linux | polkit, then sudo |
| Windows | Windows Hello |
| else | passphrase or TOTP |

## Files that must stay mode 0600 on your box

- `~/.grok/hard-allow/operator.json` (scrypt hash of your code; TOTP secret only if you chose totp)
- `~/.grok/hard-allow/session.json`
- `~/.grok/hard-allow/active.env`

## Valid stops (even when HARD ALLOW is armed)

1. You did not request the action
2. Technical failure
3. A secret you never provided
4. The session token expired

Turning HARD ALLOW **off** is not the fix for a model refuse — use the unblock ladder (`docs/06-unblock-ladder.md`).

## Reporting

Open a GitHub issue on this repository. Do not paste live tokens.
