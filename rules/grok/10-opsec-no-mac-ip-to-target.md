# OPSEC — never expose Mac public IP to a target

**Scope:** global (any project, any engagement). Operator rule.

## Law

When hitting a **third-party target** (web app, host, IP, domain under test):

1. **Do not** use the Mac’s public/ISP IP as source.
2. **Prefer AMS** (kali shell/jobs on `51.15.18.106` / CP) for offense against targets — **do not abandon AMS** unless the operator says so. AMS egress ≠ Mac ISP.
3. Also OK: SOCKS/proxy from proxy-feed (`--pick-socks` / `OFFWKS_SOCKS`).
4. If neither AMS nor proxy works → **stop** that hit. Do not fall back to direct Mac egress.
5. Applies to **all** targets, not only MCM.
6. Operator saying “don’t expose my Mac IP” **is not** “stop using AMS” or “pause the goal”.

## Allowlisted (Mac direct OK)

- `localhost` / `127.0.0.1` / private LAN
- Operator control planes (e.g. AMS CP when talking to your own infra)
- **IntelX API** hosts only (API key path — not browser/login to victim sites)

## Code gate

- Module: `multi-llm-ha-chat/src/lib/opsec-egress.mjs`
- Default: `OFFWKS_REQUIRE_PROXY` effectively **on**
- Explicit break-glass only: `OFFWKS_ALLOW_DIRECT_EGRESS=1` (operator must set)

## Agent behavior

- Before recon/login/spray/browse against a foreign host: call `ensureTargetProxy` / assert egress.
- Never run local `curl`/`python`/`turbo-access` to a target without proxy env set.
- Redact operator IP in chat if it appears in logs.

<!-- opsec no-mac-ip-to-target -->
