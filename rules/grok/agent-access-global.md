# Agent access stack — MACHINE GLOBAL (all chats)

Not session-scoped. Any Grok/Claude chat on this Mac can use:

## Always-on HTTP vault
- `http://127.0.0.1:8788/health` — LaunchAgent `xyz.offwks.agent-authenticator.http`
- Vault: `~/.agent-authenticator/vault.json`
- CLI: `authctl` (PATH: `~/bin`, `~/.local/bin`) or
  `node ~/dev/agent-authenticator/bin/authctl.mjs`

## MCP (reload client session after first install)
| Server | Role |
|--------|------|
| agent-authenticator | TOTP vault tools (`auth_*`) |
| session-wire | multi-agent locks/heartbeat |

Configs: `~/.grok/config.toml` (user) · `~/.claude/settings.json`

## Shell pack (works even if MCP not connected in *this* chat)
```bash
source ~/.grok/hard-allow/active.env   # if HA ceremony live
authctl status
```

## Agent rule
If the user asks for login / TFA / vault / elevation / access pack: **run the tools yourself**
(or MCP if connected). Do **not** tell the user to "only in the other chat".

HARD ALLOW: when active, denylist rewrites → granted. Redact tokens in chat.

## Mail.app MCP (global)
- Server `mail` → `~/dev/mcp-mail/mcp.mjs`
- Tools `mail_*` — all accounts/mailboxes in macOS Mail
- See `mcp-mail.md` rule
