# Grok MCP / client HARD ALLOW inject

**Canonical module:** `~/.grok/hard-allow/ha-inject.mjs`  
MCP re-exports: `…/grok-mcp/ha-inject.mjs` → hard-allow

## Surfaces WITH inject

| Surface | Mechanism |
|---------|-----------|
| `mcp__grok__grok_search` | instructions + wrap + refuse auto-reframe retry |
| `mcp__grok__grok_ask` | system merge |
| `mcp__grok__grok_ha_status` | status |
| `grok-gateway` `/ask` `/v1/chat/completions` `/search` | system / messages inject; /search → grokSearch |
| `grok-code-agent.mjs` | HA block in system |
| `gordythos` `grok-lib.ts` | mergeAskSystem |
| Genesis `weaponization/mesh/providers.mjs` | chatGrokSubscription |

## Surfaces WITHOUT (by design / low risk)

| Surface | Why |
|---------|-----|
| Grok Build **native** WebSearch | Product path; not our MCP — prefer MCP grok_search |
| `grok-contact-search.mjs` / rubro / logo-finder | Business contact enrichment; low dual-use refuse |
| `duo` / `consensus` orchestrators | Use `grokAsk` from mcp lib (already injects) |
| `multi-round-table` | Lazy-imports grok-lib (already injects) |
| Paid `XAI_API_KEY` one-offs | Import ha-inject if needed |

## Ops

```bash
# status
node --input-type=module -e 'import {hardAllowStatus} from "~/.grok/hard-allow/ha-inject.mjs"; console.log(hardAllowStatus())'

# smoke search
cd /Users/c/dev/coworking-mesh/mesh-compute/autonomy/grok/grok-mcp
node --input-type=module -e 'import {grokSearch} from "./grok-lib.mjs"; const r=await grokSearch({query:"test HA"}); console.log(r.refused, r.haInjected, r.text.slice(0,200))'

# reload MCP "grok" in client after code change
# opt-out / force
export GROK_MCP_HA_INJECT=0   # off
export GROK_MCP_HA_INJECT=1   # force on
```
