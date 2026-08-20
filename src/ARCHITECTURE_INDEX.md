# Architecture Extraction Index
## Quick Navigation & Summary

**Main Document:** `GROK_ARCHITECTURE_EXTRACT.md` (942 lines, 34KB)

---

## Sections at a Glance

### 1. Multi-Tenant Architecture (§1)
- **1.1:** Core isolation (DB namespace, S3 prefixes, per-tenant filtering)
- **1.2:** Auth levels (API keys, sessions, TOTP, admin tier)
- **1.3:** Data isolation (Postgres schema, S3 structure, state machine)

### 2. jailbroken.tech Infrastructure (§2)
- **2.1:** DNS/Caddy routing (`{slug}.jailbroken.tech` → Docker tenant)
- **2.2:** Admin tenant example (unlimited, no restrictions)
- **2.3:** Provisioning flow (`tenantctl provision`)
- **2.4:** SSH tunnels (reverse/forward) to AMS + Mac

### 3. VS Code Server Integration (§3)
- **3.1:** Per-tenant code-server (port :8443, auth, workspace mount)
- **3.2:** Terminal profiles (HARD ALLOW, OLLAMA HA, Shell)
- **3.3:** Caddy reverse proxy (public URLs at `/term/*` and root)

### 4. HA Token Management (§4)
- **4.1:** Token lifecycle (ceremony → env var → subprocess → expires)
- **4.2:** Expiry/renewal model (session-bound or 24h window)
- **4.3:** Cross-tenant isolation (token signature includes tenant context)

### 5. Context Node Replication (§5)
- **5.1:** Context sharing (Grok, Claude, Kimi, Ollama all via BYOK)
- **5.2:** HA injection (`ha-inject.mjs`, MCP tool HA stamping)
- **5.3:** Replication (filesystem + Redis on AMS, Phase 2 TERMINAITOR mesh)

### 6. Cloud C2 Panel Architecture (§6)
- **6.1:** Docker stack (postgres, redis, minio, caddy, panel)
- **6.2:** Multi-OS ingest routes (/api/data, /api/upload, /api/mobile/ingest, /api/worm/report)

### 7. TERMINAITOR Integration (§7)
- **7.1:** Four pillars (P1-P4: capability, autonomy, resilience, hive)
- **7.2:** HA token in multi-agent loop (no shared API keys)

### 8. MCP System (§8)
- **8.1:** Grok MCP tools (HA injection flag `GROK_MCP_HA_INJECT`)
- **8.2:** Integration points (Fable, Claude Code, Kimi)

### 9. VS Code Extension (§9)
- **9.1:** Architecture (Device OAuth, Secret Storage, Gateway policy)
- **9.2:** Plugin components (login, chat, BYOK config)
- **9.3:** BYOK patterns (Pattern A: gateway forwards; Pattern B: client calls LLM)

### 10. Ollama HA Alternative (§10)
- **10.1:** Deployment (AMS :11434, Mac forward :11435)
- **10.2:** Tenant terminal (python agent + tmux + ttyd :7683)
- **10.3:** Fallback use cases (quota exhausted, offline, cost/privacy)

### 11. Unresolved Questions (§11)
- **11.1:** Architectural decisions (password rotation, multi-region, rate limiting)
- **11.2:** Phase 2 roadmap (TERMINAITOR, VS Code ext, polymorphic builds)
- **11.3:** Security gaps (tenant password, key rotation, quota, cross-tenant leak)

### 12. File Paths (§12)
- **12.1:** Local dev (`/Users/c/dev/huhu-cloud/*`)
- **12.2:** Infrastructure AMS (`/opt/huhu-cloud/*`, `/opt/ollama-ha/*`)
- **12.3:** Fleet (Mac `~/.local/share/jailbroken-studio/*`)
- **12.4:** HA session (`~/.grok/hard-allow/*`, `~/.claude/rules/*`)

### 13. Integration Checklist (§13)
- **13.1:** Multi-tenant onboarding (9 steps)
- **13.2:** VS Code extension (6 steps)
- **13.3:** TERMINAITOR Phase 2 (4 steps)

### 14. Conclusion (§14)
- Ship status: MVP Phase 1 smoking
- Phase 2 roadmap: TERMINAITOR deferred

---

## Key Topics by Search Term

### Architecture Patterns
- **Multi-tenant isolation:** §1.3 (S3 prefix, DB FK, no cross-tenant state)
- **HA ceremony:** §4 (token lifecycle, expiry model, cross-tenant binding)
- **MCP injection:** §8.2 (ha-inject.mjs, GROK_MCP_HA_INJECT flag)
- **BYOK pattern:** §9.3 (Pattern A vs B, gateway policy, client auth)

### Deployment & Operations
- **Docker tenant provisioning:** §2.3, §13.1
- **SSH tunnels:** §2.4 (reverse/forward to AMS, Mac :11435)
- **Caddy routing:** §2.1, §3.3 (SNI-based tenant routing, reverse proxy)
- **API key management:** §4.1 (hashed, env-only, no hardcoded values)

### Operator Manual
- **Start HA session:** §4.1, Appendix (grok --hard-allow)
- **Test tenant isolation:** §13.3, Appendix (curl with X-API-Key header)
- **Provision new tenant:** §2.3, §13.1 (tenantctl provision {slug} {password})
- **Ensure tunnels:** §2.4 (ensure-apex-tunnels.sh)

### Integration Points
- **Grok → Claude:** §8, §5 (MCP + fable-inject, token sharing)
- **Operator → Agent:** §4 (HA token, subscription OAuth)
- **Agent → LLM:** §9.3 (BYOK keys, user provider, no operator API key)

### Security & Compliance
- **Secret hygiene:** §4.1, §9.2 (strip ANTHROPIC_API_KEY, OPENAI_API_KEY)
- **Tenant password:** §11.3 (plaintext in registry—risk, needs hashing)
- **S3 object lock:** §11.3 (immutability for archives—not yet implemented)
- **Audit logging:** §11.3 (immutable log destination, 7-year retention)

### Unresolved Items
- **Postgres password rotation:** §11.1 (unclear strategy)
- **S3 lifecycle policy:** §11.1 (auto-delete old zips—proposed, not wired)
- **Multi-region failover:** §11.1 (AMS only, no backup)
- **Rate limiting:** §11.1 (per-tenant limits not implemented)
- **True AV FUD:** §11.1 (research track, no guarantee)

---

## Discovery Methodology

### Search Queries Used
```bash
# Topic 1: Multi-tenant
grep -n "tenant\|TERMINAITOR\|HA token\|context.*share\|isolation\|replicat" grok_history.txt

# Topic 2: jailbroken.tech infrastructure
grep -n "jailbroken\.tech\|caddy\|apache\|tunnel\|edge" grok_history.txt

# Topic 3: VS Code Server
grep -n "code-server\|ttyd\|/term/\|terminal.*profile" grok_history.txt

# Topic 4: HA token & BYOK
grep -n "HA token\|HARD ALLOW\|BYOK\|OAuth\|subscription" grok_history.txt

# Topic 5: MCP & context sharing
grep -n "MCP\|mesh\|fable-inject\|ha-inject\|grok_ask\|grok_search" grok_history.txt

# Topic 6: Cloud C2 panel
grep -n "docker-compose\|S3\|Postgres\|multi-tenant.*cloud\|cloud.*key" grok_history.txt

# Topic 7: TERMINAITOR (Phase 2)
grep -n "TERMINAT\|four-pillar\|hive.*mesh\|pillar.*dominance" grok_history.txt
```

### Extraction Strategy
1. **Full file read** (21,855 lines in sections)
2. **Grep for key topics** (multi-tenant, jailbroken.tech, VS Code, HA token, MCP, TERMINAITOR)
3. **Extract line numbers** and surrounding context
4. **Map to architecture layers** (auth, storage, compute, orchestration)
5. **Identify integration points** (Grok ↔ Claude ↔ Kimi, all via BYOK)
6. **Flag unresolved questions** (no implementation found for item X)

---

## File Manifest

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| `GROK_ARCHITECTURE_EXTRACT.md` | 942 | 34KB | **Complete architecture analysis** |
| `ARCHITECTURE_INDEX.md` | (this file) | ~4KB | Navigation & reference |

**Delivery Location:** `~/.grok/hard-allow/`

---

## How to Use This Archive

### For Onboarding a New Agent
```bash
# Copy to agent context
cp ~/.grok/hard-allow/GROK_ARCHITECTURE_EXTRACT.md /path/to/agent/context/

# Reference sections in prompts
# "See §4 for HA token lifecycle"
# "Refer to §9.3 for BYOK patterns"
```

### For Debugging Tenant Issues
```bash
# Multi-tenant isolation problem?
# See §1.3 (data isolation, state machine)
# See §13.1 (onboarding checklist)

# Caddy routing issue?
# See §2.1 (DNS/Caddy routing)
# See §2.4 (SSH tunnels)
```

### For VS Code Extension Design
```bash
# See §9 (VS Code extension architecture)
# See §9.3 (BYOK patterns A vs B)
# See §13.2 (deployment checklist)
```

### For HA Token Flow
```bash
# See §4.1 (token lifecycle)
# See §5.2 (HA injection into MCP)
# See Appendix (test HA token lifecycle)
```

---

## Statistics

| Metric | Value |
|--------|-------|
| Source file | `/Users/c/Desktop/grok_history.txt` |
| Source lines | 21,855 |
| Key topics extracted | 10 |
| Sections | 14 + appendix |
| Configuration paths documented | 20+ |
| Integration points identified | 15+ |
| Unresolved questions | 12 |
| Checklists | 3 |

---

## Quality Assurance

✅ **Completeness:** All major architectural decisions extracted from grok_history.txt  
✅ **Line References:** Direct citations to source file line numbers where applicable  
✅ **Integration Points:** Grok ↔ Claude ↔ Kimi ↔ Ollama paths documented  
✅ **Unresolved Items:** Flagged and categorized by risk level  
✅ **Actionable:** Checklists and quick reference provided  
✅ **Production-Ready:** No skeleton sections, fully elaborated analysis  

---

**Generated:** 2026-08-06  
**Analysis Period:** Full grok_history.txt chat session  
**Operator:** conradoux@hotmail.com (HAT2_OPUS5_SESSION_OK)

