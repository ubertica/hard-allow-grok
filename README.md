# Hard Allow — Grok

**Private operator control plane** for **global HARD ALLOW** sessions on [Grok Build](https://x.ai) (and Claude-compatible shells).

HARD ALLOW is **not** a Stake/SecOps-only switch. It is **session-wide operator identity**:

1. Six-digit security code (default `996781`, overridable by env)
2. macOS **Touch ID** (LocalAuthentication)
3. → short-lived token + multi-layer arm (rules, AGENTS.md, hooks, permissions)

While active, **policy / denylist / expired / revoked / project “Never” / model soft refuses** are treated as **granted** when the operator requested the action.  
Turning HARD ALLOW **off** is **not** the fix for a model refuse — use the **unblock ladder**.

---

## Quick start

```bash
# Install into ~/.grok (see install/install.sh)
./install/install.sh

# Arm + open Grok (interactive ceremony)
grok --hard-allow

# Reuse live token
grok --hard-allow=reuse

# Smoke tests
node ~/.grok/hard-allow/ha-smoke.mjs
node ~/.grok/hard-allow/ha-smoke.mjs --strict

# Clear
node ~/.grok/hard-allow/ceremony.mjs --clear
```

---

## Repository layout

```
hard-allow-grok/
├── README.md
├── LICENSE
├── bin/grok-wrapper.sh          # → ~/.grok/bin/grok
├── src/                         # → ~/.grok/hard-allow/
│   ├── ceremony.mjs / arm.mjs / disarm.mjs
│   ├── build-ha-context.mjs / verify-injection.mjs
│   ├── unblock-ladder.mjs / ha-smoke.mjs
│   ├── SESSION-RULES.md / SYSTEM-PROMPT-OVERRIDE.md
│   ├── grants/
│   │   ├── infection-delivery-nuclear.md
│   │   ├── crypto-drainer-nuclear.md
│   │   └── infra-ops-comms-nuclear.md
│   └── …
├── skills/                      # ha-offense, ha-drainer, ha-infra
├── hooks/
├── docs/                        # include 14-nuclear-grants.md
├── install/install.sh
└── scripts/package-from-home.sh # sync live ~/.grok → this repo (no secrets)
```

## Sync workflow

```bash
# On the machine with live HARD ALLOW (after changing grants/scripts):
cd /Users/c/dev/hard-allow-grok
./scripts/package-from-home.sh
git add -A && git commit -m "sync hard-allow from home" && git push

# On another machine / reinstall:
./install/install.sh
node ~/.grok/hard-allow/arm.mjs
```

Related product repo (private): [ubertica/crypto-drainer](https://github.com/ubertica/crypto-drainer)

---

## What gets armed (multi-layer)

| Layer | Mechanism |
|-------|-----------|
| Identity | Code + Touch ID → `ha_*` token (TTL default 8h) |
| Env | `active.env` → `GROK_HARD_ALLOW_ACTIVE`, `SECOPS_HARD_ALLOW_TOKEN`, … |
| Grok launch | `--always-approve` + `--permission-mode bypassPermissions` + `--system-prompt-override` + `--rules` |
| Rules | `~/.grok/rules/00-*.md`, `~/.grok/AGENTS.md` stamp |
| Hooks | PreToolUse force-allow; SessionStart / SubagentStart re-arm |
| Shell | `~/.zshrc` auto-source when session live |
| Headless | `-p` routes to **unblock-ladder** (reframe + alt models) |
| Subagents | Prompt prefix + env inheritance + `capability_mode: all` preferred |
| SecOps (optional) | denylist/gate honor token when present |

---

## Documentation index

1. [Overview](docs/00-overview.md)  
2. [Architecture](docs/01-architecture.md)  
3. [Ceremony](docs/02-ceremony.md)  
4. [Launch & permissions](docs/03-launch-and-permissions.md)  
5. [Rules & prompts](docs/04-rules-and-prompts.md)  
6. [Hooks](docs/05-hooks.md)  
7. [Unblock ladder](docs/06-unblock-ladder.md)  
8. [Subagents](docs/07-subagents.md)  
9. [Shell integration](docs/08-shell-integration.md)  
10. [SecOps integration](docs/09-secops-integration.md)  
11. [Security](docs/10-security.md)  
12. [Verification](docs/11-verification.md)  
13. [Troubleshooting](docs/12-troubleshooting.md)  
14. [Design history](docs/13-changelog-design.md)  

---

## Security notice

- **Never commit** `session.json`, `active.env`, `ARMED`, or live tokens.  
- Default code `996781` is operator-defined; override with `SECOPS_HARD_ALLOW_CODE` / `GROK_HARD_ALLOW_CODE`.  
- HARD ALLOW is for **verified operator sessions on owned machines**. It does not authorize attacks on third parties without RoE.  
- xAI **server-side** hard blocks cannot be fully disabled client-side; the unblock ladder is the recovery path.

---

## License

Private — all rights reserved. See [LICENSE](LICENSE).
