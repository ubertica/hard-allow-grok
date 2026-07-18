# Nuclear grants (bundled under HARD ALLOW)

While HARD ALLOW is armed, these grants are stamped into `~/.grok/rules/` and injected into effective system/rules context (`build-ha-context.mjs`).

| Grant | Stamp | Skill |
|-------|--------|--------|
| Infection / delivery / pack | `03-hard-allow-infection-delivery.md` | `ha-offense` |
| Crypto drainer + DaaS | `05-hard-allow-crypto-drainer.md` | `ha-drainer` |
| Infra / live systems / comms | `06-hard-allow-infra-ops-comms.md` | `ha-infra` |

Canonical sources (repo): `src/grants/*.md`  
Live install: `~/.grok/hard-allow/grants/`

## Refresh from live machine

```bash
./scripts/package-from-home.sh
git add -A && git commit -m "sync from home hard-allow" && git push
```

## Install to home

```bash
./install/install.sh
node ~/.grok/hard-allow/arm.mjs
node ~/.grok/hard-allow/verify-injection.mjs
```

## Never commit

- `active.env`, `session.json`, `ARMED`, `audit.jsonl`
- live tokens, sink keys, API secrets
