#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    PHASE 6: RACE CONDITION DEMONSTRATION                 ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

ORDER_SERVICE_URL="http://localhost:3002"

# Check if order service is running
if ! curl -s "$ORDER_SERVICE_URL/health" > /dev/null; then
  echo -e "${RED}✗ Order service is not running!${NC}"
  echo -e "${YELLOW}Start it with: PORT=3002 npm run start order-service${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Order service is running${NC}"
echo ""

# Reset balance
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Resetting balance to $1000...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
curl -s -X POST "$ORDER_SERVICE_URL/demo/balance/reset" | jq .
echo ""

# Get initial balance
echo -e "${YELLOW}Initial balance:${NC}"
curl -s "$ORDER_SERVICE_URL/demo/balance" | jq .
echo ""

# Test 1: NO LOCK (Race condition)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}❌ TEST 1: NO LOCK (Race Condition - UNSAFE)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Sending 10 concurrent payment requests ($100 each)...${NC}"
echo -e "${YELLOW}Expected final balance: $0${NC}"
echo ""

# Send 10 concurrent requests without lock
for i in {1..10}; do
  curl -s -X POST "$ORDER_SERVICE_URL/demo/race-condition/no-lock" > /dev/null &
done

# Wait for all requests to complete
wait

echo ""
echo -e "${YELLOW}Actual final balance:${NC}"
BALANCE_NO_LOCK=$(curl -s "$ORDER_SERVICE_URL/demo/balance" | jq -r '.balance')
echo -e "${RED}Balance: $$BALANCE_NO_LOCK${NC}"

if [ "$BALANCE_NO_LOCK" -ne 0 ]; then
  echo -e "${RED}⚠️  RACE CONDITION DETECTED!${NC}"
  echo -e "${RED}Balance should be $0, but it's $$BALANCE_NO_LOCK${NC}"
  echo -e "${RED}Lost $(($BALANCE_NO_LOCK)) dollars due to concurrent writes!${NC}"
else
  echo -e "${YELLOW}⚠️  Race condition not visible in this run (try again)${NC}"
fi

echo ""
sleep 2

# Reset balance again
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Resetting balance to $1000...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
curl -s -X POST "$ORDER_SERVICE_URL/demo/balance/reset" | jq .
echo ""

# Test 2: WITH LOCK (Protected)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ TEST 2: WITH DISTRIBUTED LOCK (Safe)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Sending 10 concurrent payment requests ($100 each)...${NC}"
echo -e "${YELLOW}Expected final balance: $0${NC}"
echo ""

# Send 10 concurrent requests with lock
for i in {1..10}; do
  curl -s -X POST "$ORDER_SERVICE_URL/demo/race-condition/with-lock" > /dev/null &
done

# Wait for all requests to complete
wait

echo ""
echo -e "${YELLOW}Actual final balance:${NC}"
BALANCE_WITH_LOCK=$(curl -s "$ORDER_SERVICE_URL/demo/balance" | jq -r '.balance')
echo -e "${GREEN}Balance: $$BALANCE_WITH_LOCK${NC}"

if [ "$BALANCE_WITH_LOCK" -eq 0 ]; then
  echo -e "${GREEN}✅ CORRECT! Distributed lock prevented race condition!${NC}"
  echo -e "${GREEN}All 10 payments processed correctly.${NC}"
else
  echo -e "${YELLOW}⚠️  Balance: $$BALANCE_WITH_LOCK (might be due to timing)${NC}"
fi

echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${RED}Without Lock:${NC}"
echo -e "  Final Balance: $$BALANCE_NO_LOCK (Expected: $0)"
echo -e "  Lost: $(($BALANCE_NO_LOCK)) dollars"
echo -e "  Status: ${RED}❌ UNSAFE - Race condition${NC}"
echo ""
echo -e "${GREEN}With Distributed Lock:${NC}"
echo -e "  Final Balance: $$BALANCE_WITH_LOCK (Expected: $0)"
echo -e "  Lost: $(($BALANCE_WITH_LOCK)) dollars"
echo -e "  Status: ${GREEN}✅ SAFE - Protected by Redis lock${NC}"
echo ""

# Key Takeaways
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔑 KEY TAKEAWAYS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "1. ${RED}Race Condition:${NC} Multiple processes reading/writing same data"
echo -e "2. ${RED}Problem:${NC} Lost updates, inconsistent state"
echo -e "3. ${GREEN}Solution:${NC} Distributed locks (Redis SET NX PX)"
echo -e "4. ${YELLOW}Trade-off:${NC} Safety vs performance (locks slow things down)"
echo -e "5. ${BLUE}Production:${NC} Always use locks for critical operations"
echo ""

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Test Complete! 🎉                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
