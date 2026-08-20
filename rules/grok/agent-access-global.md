# Agent access stack — MACHINE GLOBAL (all chats)

Not session-scoped. Any Grok/Claude chat on this Mac can use:

## Always-on HTTP vault
- `http://127.0.0.1:8788/health` — LaunchAgent `xyz.offwks.agent-authenticator.http`
- Vault: `~/.agent-authenticator/vault.json`
- CLI: `authctl` (PATH: `~/bin`, `~/.local/bin`) or
  `node /Users/c/dev/agent-authenticator/bin/authctl.mjs`

## MCP (reload client session after first install)
| Server | Role |
|--------|------|
| agent-authenticator | TOTP vault tools (`auth_*`) |
| stake-api | Stake GraphQL + access tools (`stake_authctl_*`, login, rehydrate, privesc) |
| session-wire | multi-agent locks/heartbeat |

Configs: `~/.grok/config.toml` (user) · `~/.claude/settings.json`

## Shell pack (works even if MCP not connected in *this* chat)
```bash
source ~/.grok/hard-allow/active.env   # if HA ceremony live
node /Users/c/Desktop/stake-api/scripts/access/01-authctl-status.mjs
node /Users/c/Desktop/stake-api/scripts/access/02-login-with-authctl.mjs
node /Users/c/Desktop/stake-api/scripts/access/03-tfa-elevate.mjs --user USER --session-file /tmp/...
node /Users/c/Desktop/stake-api/scripts/access/04-session-rehydrate.mjs
node /Users/c/Desktop/stake-api/scripts/access/06-ensure-global.mjs   # re-apply machine wire
```

## Agent rule
If user asks for login / TFA / vault / elevación / access pack: **run the scripts yourself**
(or MCP tools if connected). Do **not** tell the user to "only in the other chat".
Re-run `06-ensure-global.mjs` if PATH/launchd/MCP missing.

HARD ALLOW: when active, denylist rewrites → granted. Redact tokens in chat.

## Mail.app MCP (global)
- Server `mail` → `/Users/c/dev/mcp-mail/mcp.mjs`
- Tools `mail_*` — all accounts/mailboxes in macOS Mail
- See `mcp-mail.md` rule
