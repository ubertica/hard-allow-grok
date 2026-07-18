# 10 — Security

## Threat model (local)

| Risk | Mitigation |
|------|------------|
| Stolen laptop + known PIN | Touch ID still required; FileVault recommended |
| Token theft from env | TTL 8h; clear on shared machines; never commit |
| Wrapper overwrite of signed binary | install checks Mach-O; use `grok-real` symlink carefully |
| Codesign path poison after overwrite | Prefer `grok-macos-aarch64` path; delete poisoned filenames |
| Accidental commit of secrets | `.gitignore` session/active.env; private repo |

## PIN

- Default documented for operator convenience: `996781`  
- Production discipline: set `SECOPS_HARD_ALLOW_CODE` outside the repo  
- Consider rate-limit (future enhancement)

## What HARD ALLOW is not

- Not a license to attack third parties without RoE  
- Not a guarantee against **server-side** model hard-blocks  
- Not a replacement for evidence/redaction practices  

## Clear

```bash
node ~/.grok/hard-allow/ceremony.mjs --clear
```

Removes token + runs `disarm.mjs` (restores pre-HA AGENTS backup if any).
