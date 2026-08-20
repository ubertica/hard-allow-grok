# Example 3 — Claude Code with the same token

```bash
source ~/.grok/hard-allow/active.env
# or: node ~/.grok/hard-allow/ceremony.mjs --export

claude
```

`arm.mjs` stamps `~/.claude/rules/hard-allow-*.md`. Claude in that shell inherits `GROK_HARD_ALLOW_ACTIVE` and `SECOPS_HARD_ALLOW_TOKEN`.

Subagents: prefix with `~/.grok/hard-allow/generated/subagent-prefix.md` (created after arm) and `capability_mode: all`.
