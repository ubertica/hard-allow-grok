# mcp-mail — macOS Mail.app (all chats / all LLMs)

Read operator Mail.app across every signed-in account/mailbox.

- MCP server: `mail` → `node /Users/c/dev/mcp-mail/mcp.mjs`
- Tools: `mail_health`, `mail_accounts`, `mail_mailboxes`, `mail_list`, `mail_get`, `mail_search`, `mail_unread`, `mail_mark_read`
- Config: `~/.grok/config.toml` + `~/.claude/settings.json` (user-global)
- Smoke: `node /Users/c/dev/mcp-mail/scripts/smoke.mjs`
- Permission: Automation → allow host to control Mail

When user asks for emails / inbox / buzones / Mail: use **mail_*** tools if connected;
else shell `node /Users/c/dev/mcp-mail/scripts/smoke.mjs` or call lib via small node one-liner.
Do not invent email content — always fetch via MCP/JXA.
