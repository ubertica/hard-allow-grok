# 03 — Launch & permissions

## Wrapper flags (when HARD ALLOW on)

| Flag | Role |
|------|------|
| `--always-approve` | No interactive tool approval prompts |
| `--permission-mode bypassPermissions` | Max local permission mode |
| `--system-prompt-override "$(cat SYSTEM-PROMPT-OVERRIDE.md)"` | Base agent law = HARD ALLOW |
| `--rules "$(cat SESSION-RULES.md)"` | Extra rules append |

## Auto-mode

If `session.json` is **live** and user runs plain `grok` (without `--no-hard-allow`), the wrapper **re-enters full HARD ALLOW launch** (silent reuse).

## Headless

If args include `-p` / `--single` / `--prompt-file`, wrapper **does not** only exec grok-real once:

→ `node unblock-ladder.mjs` (primary → reframe → alternate models)

## Binary resolution order

1. `GROK_REAL_BIN`  
2. `~/.grok/bin/grok-real`  
3. `~/.grok/downloads/grok-macos-aarch64`  
4. `~/.grok/downloads/grok-0.2.101-restored`  

Rejects targets that start with `#!` (script mistaken for binary).
