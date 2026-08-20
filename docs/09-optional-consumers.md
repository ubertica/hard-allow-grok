# 09 — Other tools on the same machine

HARD ALLOW is **defined** by the Grok (or Claude) session: ceremony → token → inject.

Anything else on the box can **read the same env** (`GROK_HARD_ALLOW_ACTIVE`, `SECOPS_HARD_ALLOW_TOKEN`) if you source `~/.grok/hard-allow/active.env`. That does not change what HARD ALLOW is. It is still a complete bypass of model refusals in the agent session.

Typical consumers:

- Local CLIs that check `GROK_HARD_ALLOW_ACTIVE=1` before skipping their own denylist
- MCP servers that treat a live `ha_*` token as operator-verified
- Child processes / subagents that inherit the parent env

If a project file still says “Never”, HA stamps `never-neutralize` so that prose is not treated as a hard stop **while the token is live**.
