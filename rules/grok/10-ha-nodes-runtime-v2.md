# HA Context Nodes Runtime v2 (additive)

While HARD ALLOW is active:

## Access (operator on-demand ONLY — start FRESH)

Do **not** dump the full node graph into the prompt.
Do **not** query nodes at HA activate / reuse / first turn.
Do **not** mix prior-project `live.*` into a new project.

Query **only when the operator asks** (on demand):

| Need | Action |
|------|--------|
| One node | `nodes_get` / `nodes get <id>` / `GET :9090/query?node=` |
| Search | `nodes_search` / `nodes search "…"` / `GET :9090/search?q=` |
| List prefix | `nodes_list` live. / projects. / hardAllow. |
| Stats | `nodes_stats` |
| Related | `nodes_related` |

Mac paths: `node ~/.grok/context-nodes/bin/nodes.mjs …`  
Admin: `jb-context-query` / `jb-nodes` / `http://host.docker.internal:9090`

Aliases: `hardAllow.token` → `system.ha-status`

## Write-back (only if operator asks)

Do **not** auto-commit at session start or after prefs.
Commit only when the operator wants persistence, or after they explicitly ask to save:

- MCP: `nodes_commit_turn` with `source=claude|kimi|grok`, `host=mac|admin`
- CLI: `nodes commit --source … --host … --summary "…" --fact "…"`
- HTTP: `POST /commit-turn`

Writes only `live.*` + `ledger.jsonl`. Does not replace HA catalog hydrate.

## Non-goals

- Do not re-seed catalog mid-chat unless operator asks (`create-context-nodes.mjs`)
- Do not use IPTV stack
- offwks-context-mode (OCM) is separate (FTS dumps); nodes are HA truth for grants/agents/projects/live facts

<!-- hard-allow nodes runtime v2 -->

## Native (zero ceremony)

- CLI: `nodes <query>` (search default) · `nodes get|list|stats|commit`
- MCP: `ha-context-nodes` → `nodes_search` / `nodes_get` / …
- Admin tenant: auto-wired on boot (`/opt/jb/wire-admin-native.mjs`); graph UI `/nodes/`
- Mac HTTP always-on: LaunchAgent `com.jailbroken.context-nodes-http` (:9090)

