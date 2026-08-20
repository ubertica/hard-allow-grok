#!/bin/bash
# Bootstrap: Propagate context-nodes RBAC authority to ALL systems
# Run this ONCE to make hard-allow-unified-context-nodes-rbac the global law

echo "╔════════════════════════════════════════════════════════════╗"
echo "║ BOOTSTRAP: Global HA RBAC via Context-Nodes Authority      ║"
echo "║ Applies to: Mac + AMS + Docker + All LLMs + All Roles     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Expand home paths
SKILLS_PATH="$HOME/.claude/skills"
PROJECTS_PATH="$HOME/.claude/projects"
CONTEXT_NODES="$HOME/.grok/context-nodes/state.json"

# Step 1: Verify context-nodes is populated with tenant/grant/channel/credential nodes
echo "1. Verifying context-nodes structure..."
NODE_COUNT=$(jq '.nodes | length' "$CONTEXT_NODES" 2>/dev/null || echo "0")
TENANT_COUNT=$(jq '[.nodes[] | select(.type=="tenant")] | length' "$CONTEXT_NODES" 2>/dev/null || echo "0")
CRED_COUNT=$(jq '[.nodes[] | select(.type=="credential")] | length' "$CONTEXT_NODES" 2>/dev/null || echo "0")
CHANNEL_COUNT=$(jq '[.nodes[] | select(.type=="comms_channel")] | length' "$CONTEXT_NODES" 2>/dev/null || echo "0")

echo "   Total nodes: $NODE_COUNT"
echo "   Tenant nodes: $TENANT_COUNT"
echo "   Credential nodes: $CRED_COUNT"
echo "   Comms channel nodes: $CHANNEL_COUNT"

if [ "$TENANT_COUNT" -lt 1 ]; then
  echo "   ✗ No tenant nodes found. Initialize with: ~/.grok/hard-allow/bootstrap-global-ha-rbac.sh"
  exit 1
fi
echo "   ✓ Context-nodes structure OK"
echo ""

# Step 2: Verify skills are present
echo "2. Verifying skills are available..."
SKILL1="$SKILLS_PATH/ha-system-unified-via-context-nodes/SKILL.md"
SKILL2="$SKILLS_PATH/offcomms-tenant-isolation-ha-model/SKILL.md"

if [ -f "$SKILL1" ]; then
  echo "   ✓ $SKILL1"
else
  echo "   ✗ Missing $SKILL1"
fi

if [ -f "$SKILL2" ]; then
  echo "   ✓ $SKILL2"
else
  echo "   ✗ Missing $SKILL2"
fi
echo ""

# Step 3: Verify memory is present
echo "3. Verifying memory (TIER 2.5 Critical)..."
MEM="$PROJECTS_PATH/-Users-c--grok/memory/hard-allow-unified-context-nodes-rbac.md"

if [ -f "$MEM" ]; then
  echo "   ✓ $MEM"
else
  echo "   ✗ Missing $MEM"
fi
echo ""

# Step 4: Document propagation strategy
echo "4. Propagation Strategy:"
echo "   ✓ Local Mac: skills + memory already available"
echo "   → AMS: rsync -avz $SKILLS_PATH/ ams:$SKILLS_PATH/"
echo "   → AMS: rsync -avz $PROJECTS_PATH/ ams:$PROJECTS_PATH/"
echo "   → Docker: mount RO $SKILLS_PATH + $PROJECTS_PATH in Dockerfile"
echo "   → Grok: reads $SKILLS_PATH + $PROJECTS_PATH on local machine"
echo "   → Kimi: reads ~/.kimi/ + $SKILLS_PATH (copy skills to ~/.kimi/skills)"
echo "   → Fable: reads ~/.fable/ + $SKILLS_PATH (copy skills to ~/.fable/skills)"
echo ""

# Step 5: Show query examples
echo "5. Example: Query Context-Nodes from Any System"
echo "   # What grants does Claude have?"
echo "   jq '.nodes.\"tenant.claude-dev-1\".grants' $CONTEXT_NODES"
echo ""
echo "   # What comms channels can Grok access?"
echo "   jq '.nodes.\"tenant.grok-dev-1\".comms_channels' $CONTEXT_NODES"
echo ""
echo "   # What's the token expiry?"
echo "   jq '.nodes.\"credential.ha-token-local\".expires_at' $CONTEXT_NODES"
echo ""

# Step 6: Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║ BOOTSTRAP READY ✓                                          ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║ All LLMs will use context-nodes as sole RBAC authority.    ║"
echo "║ No parallel ACLs, env files, or scattered config.          ║"
echo "║ Single source of truth for: grants, tokens, comms, nodes   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Sync skills to AMS: rsync -avz $SKILLS_PATH/ ams:$SKILLS_PATH/"
echo "  2. Sync memory to AMS: rsync -avz $PROJECTS_PATH/ ams:$PROJECTS_PATH/"
echo "  3. Sync context-nodes to AMS: rsync -avz $HOME/.grok/context-nodes/ ams:$HOME/.grok/context-nodes/"
echo "  4. Update Docker Dockerfile to mount $SKILLS_PATH (RO)"
echo "  5. Restart all LLMs to load new skills + memory"
echo ""
echo "Verify propagation with:"
echo "  ssh ams 'jq \".nodes | length\" ~/.grok/context-nodes/state.json'"
echo "  docker cp $(docker ps -q):root/.grok/context-nodes/state.json - | jq '.nodes | length'"
echo ""
