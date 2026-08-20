#!/bin/bash
###############################################################################
# MCP Context Query Pipeline — Daemon Installation Script
#
# Installs the MCP daemon with auto-startup on macOS (launchd) or Linux (systemd).
# Usage: bash mcp-daemon-install.sh [--install | --uninstall | --status]
###############################################################################

set -e

HOME="${HOME:=$(eval echo ~$(whoami))}"
HARD_ALLOW_DIR="$HOME/.grok/hard-allow"
DAEMON_PATH="$HARD_ALLOW_DIR/mcp-server-daemon.mjs"
TOOL_PATH="$HARD_ALLOW_DIR/mcp-context-query-pipeline.mjs"
REGISTRATION_SCRIPT="$HARD_ALLOW_DIR/mcp-tool-registration.sh"
LOG_FILE="$HARD_ALLOW_DIR/mcp-daemon-install.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
  exit 1
}

success() {
  echo -e "${GREEN}[OK]${NC} $*" | tee -a "$LOG_FILE"
}

info() {
  echo -e "${YELLOW}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

status() {
  echo -e "${BLUE}[STATUS]${NC} $*" | tee -a "$LOG_FILE"
}

# Detect OS
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

OS=$(detect_os)

# Verify dependencies
verify_dependencies() {
  log "Verifying dependencies"

  if ! command -v node &>/dev/null; then
    error "Node.js not found. Please install Node.js 18+"
  fi

  if ! command -v bash &>/dev/null; then
    error "bash not found"
  fi

  # Verify tool files exist
  if [[ ! -f "$DAEMON_PATH" ]]; then
    error "Daemon script not found: $DAEMON_PATH"
  fi

  if [[ ! -f "$TOOL_PATH" ]]; then
    error "Tool script not found: $TOOL_PATH"
  fi

  success "All dependencies verified"
}

# Make scripts executable
make_executable() {
  log "Making scripts executable"
  chmod +x "$DAEMON_PATH"
  chmod +x "$TOOL_PATH"
  if [[ -f "$REGISTRATION_SCRIPT" ]]; then
    chmod +x "$REGISTRATION_SCRIPT"
  fi
  success "Scripts are executable"
}

# Install on macOS using launchd
install_macos() {
  log "Installing for macOS (launchd)"

  local launchd_plist="$HARD_ALLOW_DIR/mcp-daemon-launchd.plist"
  local launchd_dest="$HOME/Library/LaunchAgents/com.jailbroken.mcp-context-query-pipeline.plist"

  if [[ ! -f "$launchd_plist" ]]; then
    error "launchd plist template not found: $launchd_plist"
  fi

  # Substitute placeholders
  local user=$(whoami)
  sed "s|SUBSTITUTED_HOME|$HOME|g; s|SUBSTITUTED_USER|$user|g" "$launchd_plist" > "$launchd_dest"

  info "Installing launchd plist to $launchd_dest"
  mkdir -p "$(dirname "$launchd_dest")"

  # Validate plist
  if ! plutil -lint "$launchd_dest" >/dev/null 2>&1; then
    error "Invalid plist: $launchd_dest"
  fi

  success "launchd plist installed"

  # Load service
  log "Loading launchd service"
  if launchctl list | grep -q "com.jailbroken.mcp-context-query-pipeline" 2>/dev/null; then
    info "Service already loaded, unloading first"
    launchctl unload "$launchd_dest" 2>/dev/null || true
  fi

  launchctl load "$launchd_dest"
  success "launchd service loaded"

  # Verify running
  sleep 1
  if launchctl list | grep -q "com.jailbroken.mcp-context-query-pipeline" 2>/dev/null; then
    success "MCP daemon is running"
  else
    error "Failed to start MCP daemon"
  fi
}

# Install on Linux using systemd
install_linux() {
  log "Installing for Linux (systemd)"

  local systemd_service="/etc/systemd/user/mcp-context-query-pipeline.service"
  local systemd_local="$HOME/.config/systemd/user/mcp-context-query-pipeline.service"

  # Try user systemd first (no sudo)
  if [[ -w "$(dirname "$systemd_local")" ]] || mkdir -p "$(dirname "$systemd_local")" 2>/dev/null; then
    log "Installing user systemd service"

    cat > "$systemd_local" << EOF
[Unit]
Description=MCP Context Query Pipeline Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env node $DAEMON_PATH
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment="HOME=$HOME"
Environment="PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
WorkingDirectory=$HARD_ALLOW_DIR

[Install]
WantedBy=default.target
EOF

    success "systemd user service installed"

    # Reload and start
    systemctl --user daemon-reload
    systemctl --user enable mcp-context-query-pipeline.service
    systemctl --user start mcp-context-query-pipeline.service

    sleep 1
    if systemctl --user is-active --quiet mcp-context-query-pipeline.service; then
      success "MCP daemon is running"
    else
      error "Failed to start MCP daemon"
    fi
  else
    info "User systemd not available, would need sudo for system-wide install"
    info "For system-wide install, run:"
    echo "  sudo cp $HARD_ALLOW_DIR/mcp-context-query-pipeline.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable mcp-context-query-pipeline.service"
    echo "  sudo systemctl start mcp-context-query-pipeline.service"
  fi
}

# Uninstall daemon
uninstall() {
  log "Uninstalling MCP daemon"

  if [[ "$OS" == "macos" ]]; then
    local launchd_dest="$HOME/Library/LaunchAgents/com.jailbroken.mcp-context-query-pipeline.plist"
    if [[ -f "$launchd_dest" ]]; then
      launchctl unload "$launchd_dest" 2>/dev/null || true
      rm -f "$launchd_dest"
      success "launchd service uninstalled"
    fi
  elif [[ "$OS" == "linux" ]]; then
    local systemd_local="$HOME/.config/systemd/user/mcp-context-query-pipeline.service"
    if [[ -f "$systemd_local" ]]; then
      systemctl --user stop mcp-context-query-pipeline.service 2>/dev/null || true
      systemctl --user disable mcp-context-query-pipeline.service 2>/dev/null || true
      rm -f "$systemd_local"
      systemctl --user daemon-reload
      success "systemd service uninstalled"
    fi
  fi

  log "Uninstall complete"
}

# Show daemon status
show_status() {
  status "Checking MCP daemon status"

  # Check PID file
  local pid_file="$HARD_ALLOW_DIR/mcp-daemon.pid"
  if [[ -f "$pid_file" ]]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      status "Daemon is running (PID: $pid)"
    else
      status "Daemon is not running (stale PID file)"
    fi
  else
    status "Daemon is not running"
  fi

  # Check service status
  if [[ "$OS" == "macos" ]]; then
    if launchctl list | grep -q "com.jailbroken.mcp-context-query-pipeline" 2>/dev/null; then
      status "launchd service: loaded"
    else
      status "launchd service: not loaded"
    fi
  elif [[ "$OS" == "linux" ]]; then
    if systemctl --user is-active --quiet mcp-context-query-pipeline.service 2>/dev/null; then
      status "systemd service: running"
    else
      status "systemd service: not running"
    fi
  fi

  # Check health endpoint
  if command -v curl &>/dev/null; then
    if curl -s http://127.0.0.1:9998/health >/dev/null 2>&1; then
      local health=$(curl -s http://127.0.0.1:9998/health)
      status "Health check: OK"
      status "Details: $health"
    else
      status "Health check: failed (daemon may not be running)"
    fi
  fi

  # Show log
  if [[ -f "$LOG_FILE" ]]; then
    status "Recent logs:"
    tail -20 "$LOG_FILE"
  fi
}

# Main entry point
main() {
  local action="${1:-install}"

  log "MCP Daemon Installer (OS: $OS)"

  case "$action" in
  install)
    verify_dependencies
    make_executable
    if [[ "$OS" == "macos" ]]; then
      install_macos
    elif [[ "$OS" == "linux" ]]; then
      install_linux
    else
      error "Unsupported OS: $OS"
    fi

    # Run tool registration
    if [[ -x "$REGISTRATION_SCRIPT" ]]; then
      log "Running tool registration"
      bash "$REGISTRATION_SCRIPT"
    fi

    success "Installation complete!"
    info "Daemon will auto-start on reboot"
    info "Check status with: bash $0 --status"
    ;;

  uninstall)
    uninstall
    success "Uninstall complete"
    ;;

  status)
    show_status
    ;;

  *)
    echo "Usage: $0 [--install | --uninstall | --status]"
    echo ""
    echo "  --install   Install and start the MCP daemon"
    echo "  --uninstall Remove the MCP daemon"
    echo "  --status    Check daemon status and health"
    exit 1
    ;;
  esac
}

main "$@"
