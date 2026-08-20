# HARD ALLOW installer

Shareable pack of the HA **system**. Does **not** include a live session token.

## Build (this machine)

```bash
ha pack
# or: node ~/.grok/hard-allow/installer/build.mjs
```

Outputs (see `installer/dist/LATEST.txt`):

- `ha-setup-<stamp>.sh` — self-extracting (macOS/Linux, needs `node` + `tar`)
- `ha-setup-<stamp>.tgz` — unpack then `node payload/install.mjs`

## New user

```bash
# needs Node 18+
bash ha-setup-*.sh
# then:
node ~/.grok/hard-allow/ceremony.mjs --init    # THEIR code + confirm
node ~/.grok/hard-allow/ceremony.mjs            # arm
# or grok --hard-allow if the wrapper landed on PATH
```

`--init` is required on a fresh install (legacy default code is **not** accepted).

## Grok CLI (any OS)

The installer **looks for** a stock Grok binary:

- `GROK_REAL` env
- `grok` / `grok.exe` on PATH (skips HA wrapper scripts)
- `~/.grok/bin/grok-real`
- `~/.grok/downloads/grok-*` matching this OS/arch (`macos`/`linux`/`windows` + `aarch64`/`x64`)

If found, it writes `~/.grok/hard-allow/grok-paths.env` (Unix) / `grok-paths.cmd` (Windows) and installs a wrapper in `~/.grok/bin` that points at **that** binary — not a hardcoded Mac path.

```bash
# Unix
export PATH="$HOME/.grok/bin:$PATH"
grok --hard-allow

# Windows
# add %USERPROFILE%\.grok\bin to PATH, then:
grok --hard-allow
```

If Grok is **not** installed and you are on a TTY, the installer **asks** whether to run the official xAI CLI:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
```

Default is yes. After that script finishes, HA re-detects the binary (any OS/arch), writes `grok-paths.env`, and **replaces** `~/.grok/bin/grok` with the HA wrapper (`grok-real` keeps the stock binary).

```bash
# non-interactive
./install.sh --install-grok --skip-init
./install.sh --no-install-grok --skip-init

# already have HA, only wrap Grok
node ~/.grok/hard-allow/installer/install.mjs --wire-grok
```

Windows: extract the `.tgz` and `node payload\install.mjs` (or `install.ps1` in the stage folder).
