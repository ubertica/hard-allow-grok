# OFFWKS Context Mode (token hygiene)

When MCP server **offwks-context-mode** is connected, prefer its tools over dumping large I/O into context.

## Prefer

| Instead of | Use |
|------------|-----|
| Huge Bash stdout | `ctx_execute` language=shell |
| Many Read() of big files | `ctx_execute_file` + reducer or `ctx_index` + `ctx_search` |
| Full WebFetch HTML | `ctx_fetch_and_index` |
| Lost state after compact | `ctx_session_recall` + `ctx_search` |
| Important decisions | `ctx_session_capture` |

## Law

1. Do not paste multi-KB tool dumps into replies if `ctx_*` can hold them.
2. Analysis = **code** (`ctx_execute` javascript) that prints only the answer.
3. `ctx_fetch_doc full=true` is last resort.
4. Subscription-only stack — no API keys required for OCM.

Full routing: `/Users/c/dev/offwks-context-mode/configs/ROUTING.md`  
RUNBOOK: `/Users/c/dev/offwks-context-mode/RUNBOOK.md`
