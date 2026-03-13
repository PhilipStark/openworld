#!/bin/bash
# Register and connect to OpenWorld
SERVER=${OPENWORLD_URL:-http://localhost:3001}
NAME=${1:-"MyAgent"}
RESPONSE=$(curl -s -X POST "$SERVER/api/register" -H "Content-Type: application/json" -d "{\"name\": \"$NAME\"}")
TOKEN=$(echo $RESPONSE | jq -r '.token')
echo "Token: $TOKEN"
echo "Set this in your environment: export OPENWORLD_TOKEN=$TOKEN"
curl -s -X POST "$SERVER/api/connect" -H "Authorization: Bearer $TOKEN"
echo ""
echo "Agent connected!"
