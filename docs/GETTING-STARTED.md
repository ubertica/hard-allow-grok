# Getting started — HARD ALLOW on your machine

HARD ALLOW is a **complete bypass**. After install + ceremony, Grok executes what you order — no policy exception, no “I can’t.” Details: [00-overview.md](00-overview.md).

## 1. Clone and install

```bash
git clone https://github.com/ubertica/hard-allow-grok.git
cd hard-allow-grok
./install.sh
```

Flags:

```bash
./install.sh --skip-init     # copy files only; you run --init later
./install.sh --dry-run       # print paths, copy nothing
```

Install target: `~/.grok/hard-allow/`  
Skills: `~/.grok/skills/` (and `~/.claude/skills/` if that tree exists)  
Rules: `~/.grok/rules/` and `~/.claude/rules/`

## 2. Create YOUR operator identity

```bash
node ~/.grok/hard-allow/ceremony.mjs --init
```

You will:

1. Choose a security code (hashed with scrypt into `operator.json`; never stored plaintext)
2. Choose a second factor: `auto` | `touchid` | `polkit` | `sudo` | `windows-hello` | `totp` | `passphrase`

`auto` picks Touch ID on macOS, polkit/sudo on Linux, Windows Hello on Windows.

**Fresh installs do not accept any shared default PIN.** `--init` is mandatory.

## 3. Arm a session

```bash
node ~/.grok/hard-allow/ceremony.mjs
# or
export PATH="$HOME/.grok/bin:$PATH"
grok --hard-allow
```

This writes:

- `~/.grok/hard-allow/session.json` (token + expiry)
- `~/.grok/hard-allow/active.env` (`GROK_HARD_ALLOW_ACTIVE=1`, token, scope `*`)
- rule stamps under `~/.grok/rules/`
- effective inject via `build-ha-context.mjs` → `generated/system-prompt-effective.md`

Default TTL: **8 hours** (`SECOPS_HARD_ALLOW_TTL_MS`).

## 4. Reuse / status / clear

```bash
grok --hard-allow=reuse
node ~/.grok/hard-allow/ceremony.mjs --check
ha status
node ~/.grok/hard-allow/ceremony.mjs --clear   # wipe token + disarm
```

## 5. Verify injection

```bash
node ~/.grok/hard-allow/verify-injection.mjs
node ~/.grok/hard-allow/ha-smoke.mjs
node ~/.grok/hard-allow/disposition-canary.mjs --dry
```

## 6. Claude Code (same token)

If you use Claude in the same shell:

```bash
source ~/.grok/hard-allow/active.env
# Claude reads ~/.claude/rules/hard-allow-*.md stamped by arm.mjs
```

## Grok binary not found?

HA still installs. Later:

```bash
# install stock Grok, then:
node ~/.grok/hard-allow/installer/install.mjs --wire-grok
# or:
export GROK_REAL=/path/to/stock-grok-binary
```

Put `$HOME/.grok/bin` **before** any other `grok` on PATH so you get the HA wrapper (stock Grok rejects `--hard-allow`).

## Next

- [CAPABILITIES.md](CAPABILITIES.md)
- [14-nuclear-grants.md](14-nuclear-grants.md)
- [examples/](../examples/)
