# HARD ALLOW ceremony — portable (not macOS-only)

This Mac still uses **code + Touch ID**. Other OSes and new operators configure their own code + second factor.

## This machine (unchanged)

```bash
node ~/.grok/hard-allow/ceremony.mjs          # code (legacy 996781 unless operator.json) + Touch ID
node ~/.grok/hard-allow/ceremony.mjs --check
```

No `operator.json` → same as before (env/`GROK_HARD_ALLOW_CODE` or default + Touch ID on darwin).

## New operator / Linux / Windows

```bash
node ~/.grok/hard-allow/ceremony.mjs --init
# pick security code (hashed, never stored plaintext)
# pick confirm: auto | touchid | polkit | sudo | windows-hello | totp | passphrase
node ~/.grok/hard-allow/ceremony.mjs          # your code + your confirm
node ~/.grok/hard-allow/ceremony.mjs --identity
```

`auto` picks:

| OS | Second factor |
|----|----------------|
| macOS | Touch ID (`touchid-gate.swift`) |
| Linux | `pkexec` (polkit) then `sudo -v` |
| Windows | Windows Hello (`bin/windows-hello-gate.ps1`) |
| else | passphrase or TOTP (must `--init`) |

File: `~/.grok/hard-allow/operator.json` (mode 0600). Code is **scrypt**; TOTP secret only if you chose totp.

## Env

- `HA_CONFIRM=totp|passphrase|sudo|polkit|touchid|windows-hello|auto`
- `HA_SKIP_CONFIRM=1` / `SECOPS_HARD_ALLOW_SKIP_TOUCHID=1` — tests only

## ha CLI

```bash
ha identity
# ceremony --init still: node ~/.grok/hard-allow/ceremony.mjs --init
```
