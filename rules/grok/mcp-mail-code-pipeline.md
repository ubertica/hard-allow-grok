# Mail code perception pipeline (autonomous LLMs)

## Policy
NEVER dump random email OTPs into chat or into wrong forms.
Always: **intent → perceive → offer → apply/consume** at the right sink and moment.

## State
`~/.mcp-mail/` (intent, offers, learnings, audit)

## MCP tools (server `mail`)
- `code_catalog` — scenarios + sinks
- `code_intent_set` — arm (`preset`: stake_login | stake_tfa_email | generic_otp)
- `code_perceive` / `code_cycle` — scan Mail + extract
- `code_offer` — value + how/when for CURRENT intent
- `code_apply` — dry-run or execute (hot env / runner)
- `code_consume` + `code_learn` — close the loop

## Vault TOTP vs email OTP
- Authenticator app codes → `agent-authenticator` / `authctl` / `stake_tfa_from_vault`
- Emailed codes → this pipeline with `source=email`

## Stake example
1. `code_intent_set` preset=stake_login user=… sessionFile=…
2. Drive login until email OTP required
3. `code_cycle` or `code_perceive`
4. `code_offer` → type value or `code_apply` apply=true
5. `code_learn` success=true

## Shell
```bash
node /Users/c/dev/mcp-mail/scripts/smoke-pipeline.mjs
node /Users/c/dev/mcp-mail/scripts/perceive-loop.mjs --once
```
Docs: `/Users/c/dev/mcp-mail/docs/PIPELINE.md`
