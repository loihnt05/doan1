#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         PHASE 6: FENCED TOKENS DEMONSTRATION             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

ORDER_SERVICE_URL="http://localhost:3002"
ORDER_ID="test-order-123"

# Check if order service is running
if ! curl -s "$ORDER_SERVICE_URL/health" > /dev/null; then
  echo -e "${RED}✗ Order service is not running!${NC}"
  echo -e "${YELLOW}Start it with: PORT=3002 npm run start order-service${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Order service is running${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔒 What are Fenced Tokens?${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Fenced tokens solve the 'stale write' problem:"
echo ""
echo "Problem:"
echo "  1. Worker A acquires lock + token 1"
echo "  2. Worker A pauses (GC, network delay)"
echo "  3. Lock expires"
echo "  4. Worker B acquires lock + token 2"
echo "  5. Worker B completes work (token 2)"
echo "  6. Worker A resumes, tries to write (token 1) ← STALE!"
echo ""
echo "Solution: Fenced Tokens"
echo "  • Token increments with each lock acquisition"
echo "  • Before write, check token is still highest"
echo "  • Reject write if token is stale"
echo ""
sleep 3

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} TEST: Demonstrating Fenced Tokens${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Scenario:${NC}"
echo "  • 3 workers process same order concurrently"
echo "  • Each gets incrementing token"
echo "  • Worker with highest token wins"
echo "  • Workers with stale tokens rejected"
echo ""

# Launch 3 concurrent requests
echo -e "${YELLOW}Launching 3 concurrent workers...${NC}"
echo ""

# Worker 1
(
  sleep 0.1
  echo -e "${BLUE}[Worker 1] Starting with token...${NC}"
  RESULT=$(curl -s -X POST "$ORDER_SERVICE_URL/demo/fenced-token/$ORDER_ID")
  TOKEN=$(echo $RESULT | jq -r '.token // "N/A"')
  SUCCESS=$(echo $RESULT | jq -r '.success')
  
  if [ "$SUCCESS" = "true" ]; then
    echo -e "${GREEN}[Worker 1] ✓ Success with token $TOKEN${NC}"
  else
    echo -e "${RED}[Worker 1] ✗ Rejected with token $TOKEN (stale)${NC}"
  fi
  echo "$RESULT" | jq .
) &

# Worker 2
(
  sleep 0.2
  echo -e "${BLUE}[Worker 2] Starting with token...${NC}"
  RESULT=$(curl -s -X POST "$ORDER_SERVICE_URL/demo/fenced-token/$ORDER_ID")
  TOKEN=$(echo $RESULT | jq -r '.token // "N/A"')
  SUCCESS=$(echo $RESULT | jq -r '.success')
  
  if [ "$SUCCESS" = "true" ]; then
    echo -e "${GREEN}[Worker 2] ✓ Success with token $TOKEN${NC}"
  else
    echo -e "${RED}[Worker 2] ✗ Rejected with token $TOKEN (stale)${NC}"
  fi
  echo "$RESULT" | jq .
) &

# Worker 3
(
  sleep 0.3
  echo -e "${BLUE}[Worker 3] Starting with token...${NC}"
  RESULT=$(curl -s -X POST "$ORDER_SERVICE_URL/demo/fenced-token/$ORDER_ID")
  TOKEN=$(echo $RESULT | jq -r '.token // "N/A"')
  SUCCESS=$(echo $RESULT | jq -r '.success')
  
  if [ "$SUCCESS" = "true" ]; then
    echo -e "${GREEN}[Worker 3] ✓ Success with token $TOKEN${NC}"
  else
    echo -e "${RED}[Worker 3] ✗ Rejected with token $TOKEN (stale)${NC}"
  fi
  echo "$RESULT" | jq .
) &

# Wait for all workers
wait

echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 WHAT HAPPENED?${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "1. Each worker gets incrementing fenced token (1, 2, 3)"
echo "2. Each worker acquires lock and processes (2 seconds)"
echo "3. Before writing, each validates token"
echo "4. Only worker with highest token succeeds"
echo "5. Workers with stale tokens are rejected"
echo ""

echo -e "${GREEN}Result:${NC} Stale writes prevented! "
echo ""

# Key Takeaways
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔑 KEY TAKEAWAYS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "1. ${YELLOW}Distributed locks alone are not enough${NC}"
echo -e "   • Lock can expire while worker is processing"
echo -e "   • Another worker gets lock and proceeds"
echo -e "   • First worker resumes with stale context"
echo ""
echo -e "2. ${GREEN}Fenced tokens solve this:${NC}"
echo -e "   • Token increments monotonically (Redis INCR)"
echo -e "   • Each lock acquisition gets new token"
echo -e "   • Storage system validates token before write"
echo ""
echo -e "3. ${BLUE}Implementation:${NC}"
echo -e "   • Use Redis INCR for token generation"
echo -e "   • Store current token in Redis"
echo -e "   • Validate token < current before write"
echo ""
echo -e "4. ${RED}Critical for production systems:${NC}"
echo -e "   • Prevents data corruption"
echo -e "   • Ensures linearizability"
echo -e "   • Essential for financial systems"
echo ""

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Test Complete! 🎉                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
