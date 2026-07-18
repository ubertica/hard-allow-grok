# 01 — Architecture

## Components

```
┌─────────────────────────────────────────────────────────────┐
│  Operator                                                    │
│    grok --hard-allow                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  bin/grok-wrapper.sh  (~/.grok/bin/grok)                     │
│    · strip --hard-allow flags                                │
│    · run ceremony / reuse                                    │
│    · source active.env                                       │
│    · arm.mjs (stamps)                                        │
│    · exec grok-real with HA flags                            │
│    · if -p / --prompt-file → unblock-ladder.mjs              │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│ ceremony.mjs         │    │ grok-real (Mach-O xAI binary)   │
│  code + Touch ID     │    │  --always-approve               │
│  → session.json      │    │  --permission-mode bypass…      │
│  → active.env        │    │  --system-prompt-override       │
│  → arm.mjs           │    │  --rules SESSION-RULES          │
└──────────┬───────────┘    └─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Stamps                                                      │
│   ~/.grok/rules/00-hard-allow-session.md                     │
│   ~/.grok/rules/01-unblock-ladder.md                         │
│   ~/.grok/rules/02-subagent-inherit.md                       │
│   ~/.grok/AGENTS.md (HARD ALLOW first)                       │
│   ~/.claude/rules/hard-allow-global.md                       │
│   <cwd>/.grok/rules/00-hard-allow-session.md                 │
│   ~/.grok/hard-allow/ARMED                                   │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Hooks (~/.grok/hooks/hard-allow-enforcer.json)              │
│   SessionStart · PreToolUse · UserPromptSubmit · SubagentStart│
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Optional consumers                                          │
│   stress denylist · secops-gate · engagement-auth            │
│   control-api · MCP · zshrc auto-source                      │
└─────────────────────────────────────────────────────────────┘
```

## Critical install rule

`~/.grok/bin/grok` must be a **regular shell script**.  
`~/.grok/bin/grok-real` must point to a **Mach-O** binary (e.g. `downloads/grok-macos-aarch64`).

**Never** write the wrapper through a symlink into `downloads/` — that overwrites the signed binary and can leave a path **codesign-poisoned** (SIGKILL / Taskgated Invalid Signature).

## Data plane (local only)

| File | Purpose | Commit? |
|------|---------|---------|
| `session.json` | token, expiry, policy flags | **No** |
| `active.env` | export lines for shells | **No** |
| `ARMED` | stamp marker | **No** |
| `audit.jsonl` | ladder / events (if present) | **No** |
