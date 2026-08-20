#!/bin/bash
# Verification script for Wave 3 + Wave 4 deployment

set -e

HA_DIR="$HOME/.grok/hard-allow"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Wave 3 + Wave 4 Verification${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════${NC}\n"

# Check files exist
echo -e "${YELLOW}Checking files...${NC}"
files=(
  "fable-integration.mjs"
  "metrics-collector.mjs"
  "observability-dashboard.mjs"
  "cloud-deploy.mjs"
  "WAVE3-FABLE-INTEGRATION.md"
  "WAVE4-OBSERVABILITY.md"
  "WAVE3-WAVE4-QUICK-START.md"
  "HA-WAVES-ROADMAP.md"
)

all_exist=true
for file in "${files[@]}"; do
  if [ -f "$HA_DIR/$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${RED}✗${NC} $file (NOT FOUND)"
    all_exist=false
  fi
done

if [ "$all_exist" = false ]; then
  echo -e "\n${RED}ERROR: Some files missing${NC}"
  exit 1
fi

# Verify syntax
echo -e "\n${YELLOW}Checking syntax...${NC}"
for mjs in fable-integration metrics-collector observability-dashboard cloud-deploy; do
  if node --check "$HA_DIR/$mjs.mjs" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $mjs.mjs"
  else
    echo -e "${RED}✗${NC} $mjs.mjs (SYNTAX ERROR)"
    exit 1
  fi
done

# Test Wave 3
echo -e "\n${YELLOW}Testing Wave 3 (Fable Integration)...${NC}"
cd "$HA_DIR" && node -e "
import('./fable-integration.mjs').then(m => {
  const types = m.getAgentTypes();
  console.log('✓ Agent types:', Object.keys(types).length);
  
  const agent = new m.FableAgent('test', 'rule-injector');
  console.log('✓ Agent created:', agent.type);
  
  const pool = new m.FableAgentPool([agent]);
  console.log('✓ Pool created with', pool.agents.length, 'agent(s)');
  
  process.exit(0);
}).catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
" || exit 1

# Test Wave 4 Metrics
echo -e "\n${YELLOW}Testing Wave 4 (Metrics Collector)...${NC}"
cd "$HA_DIR" && node -e "
import('./metrics-collector.mjs').then(m => {
  const collector = new m.MetricsCollector('verify-test');
  collector.recordArmStart();
  collector.recordInjection('grok', 2100, 'success');
  collector.recordArmEnd();
  
  const json = collector.toJSON();
  console.log('✓ Metrics recorded:', json.injections?.length || 0, 'injections');
  
  const prom = collector.toPrometheus();
  console.log('✓ Prometheus export:', prom.split('\n').length - 1, 'metrics');
  
  process.exit(0);
}).catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
" || exit 1

# Test Wave 4 Dashboard
echo -e "\n${YELLOW}Testing Wave 4 (Dashboard)...${NC}"
cd "$HA_DIR" && node -e "
import('./observability-dashboard.mjs').then(m => {
  const chart = m.ChartRenderer.sparkline([1, 2, 3, 4, 5], { width: 20 });
  console.log('✓ Sparkline chart rendered');
  
  const dashboard = new m.ObservabilityDashboard();
  console.log('✓ Dashboard instantiated');
  
  process.exit(0);
}).catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
" || exit 1

# Test Wave 4 Cloud Deploy
echo -e "\n${YELLOW}Testing Wave 4 (Cloud Deploy)...${NC}"
cd "$HA_DIR" && node -e "
import('./cloud-deploy.mjs').then(m => {
  const config = new m.CloudDeploymentConfig();
  console.log('✓ Cloud config created');
  
  const validation = m.DeploymentValidator.validate(config.config);
  console.log('✓ Config validation:', validation.valid ? 'VALID' : 'INVALID');
  
  process.exit(0);
}).catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
" || exit 1

# Final summary
echo -e "\n${CYAN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ All Wave 3 + Wave 4 components verified${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════${NC}\n"

echo -e "Next steps:"
echo -e "  1. Read quick start: ${CYAN}WAVE3-WAVE4-QUICK-START.md${NC}"
echo -e "  2. View dashboard:  ${CYAN}node ~/.grok/hard-allow/observability-dashboard.mjs${NC}"
echo -e "  3. Check arm:       ${CYAN}node ~/.grok/hard-allow/ceremony.mjs --check${NC}"
echo -e "  4. Plan cloud:      ${CYAN}node ~/.grok/hard-allow/cloud-deploy.mjs --plan${NC}\n"

exit 0
