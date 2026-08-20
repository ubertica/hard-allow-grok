# Contributing

## Sync from a live HARD ALLOW install (maintainers)

```bash
./scripts/sync-from-live.sh
git status
# confirm no session.json / active.env / operator.json / *.jsonl
```

## Do not commit

See `.gitignore` and `SECURITY.md`.

## Docs

User-facing install path is `./install.sh` → `installer/install.mjs` → `src/`.
Keep `examples/` copy-pasteable on a machine that is not this one.
