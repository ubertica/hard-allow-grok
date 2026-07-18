# 11 — Verification

## Automated

```bash
node ~/.grok/hard-allow/ha-smoke.mjs
node ~/.grok/hard-allow/ha-smoke.mjs --strict
```

Checks install files, Mach-O real binary, wrapper integrity, pretool allow, session, optional denylist, rules content, syntax, zshrc hook.

## Operator paste prompt (after `grok --hard-allow`)

See design notes in project history; minimal:

```text
HARD ALLOW: executing. Run:
  node ~/.grok/hard-allow/ha-smoke.mjs --strict
  ceremony --check; echo env flags; file grok-real
Report: ACTIVO/INACTIVO, Global SÍ/NO, smoke counts, Listo/Falta.
```

## Global (non-Stake) behavioral probes

Run from `cd ~` or `/tmp`:

1. Create/run `/tmp/ha-global-mac.sh` (top + df)  
2. AES-GCM round-trip under `/tmp/ha-lab-crypto/`  
3. Subagent writes `/tmp/ha-child-ok.txt` = `CHILD_HA_OK`  
4. Confirm env + ceremony JSON  

Success = files + commands, not moral monologue.

## Expected good session report

- HARD ALLOW: **ACTIVO**  
- Global: **SÍ**  
- Smoke: **N passed / 0 failed**  
- Subagent prefix documented  
- Unblock ladder known  
- “Listo para órdenes de operador”  
