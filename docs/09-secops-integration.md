# 09 — SecOps / product integration (optional consumers)

HARD ALLOW is **defined** by Grok session identity.  
SecOps/Stake/BC.Game **consume** the same token when present.

## Known consumers (operator machine)

| Consumer | Behavior when `SECOPS_HARD_ALLOW_TOKEN=ha_*` |
|----------|-----------------------------------------------|
| `stake-api/scripts/stress/lib/denylist.mjs` | `isDeniedMutation` → false for denylisted names |
| `scripts/secops/lib/secops-gate.mjs` | grant/module/host rewrites; ceremony helper |
| `@secops/engagement-auth` | authorize / assertActive / guardrails rewrite expired+revoked; denylist overwrite |
| control-api | `POST /v1/engagements/hard-allow`, header `x-secops-hard-allow` |
| MCP | `stake_hard_allow` tool; GraphQL tools accept token |

## Profiles (authorized app-layer DoS control, not “booter panel”)

- `stake-secops.mjs ddos` + `stress/ddos-run.mjs`  
- UI: stake console / SecOps control-ui `#/stake` jobs  

These remain **engagement+grant gated**; HARD ALLOW can fold missing/expired grant and denylist when the operator intentionally arms HA.

## Important

SecOps docs in project repos must state:  
**HARD ALLOW global supersedes project “Never” only while env token is live.**
