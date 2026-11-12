#!/bin/sh
set -e

UNLEASH_URL="http://unleash:4242"

echo "Waiting for Unleash API to be fully ready..."
sleep 5

echo "Logging in as admin to get session cookie..."
LOGIN_RESPONSE=$(curl -s -c /tmp/unleash-cookies -X POST "${UNLEASH_URL}/auth/simple/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"unleash4all"}')

echo "Login response: ${LOGIN_RESPONSE}"

echo "Creating lightbulb-colour feature flag..."
CREATE_RESPONSE=$(curl -s -b /tmp/unleash-cookies -X POST "${UNLEASH_URL}/api/admin/projects/default/features" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lightbulb-colour",
    "type": "release",
    "description": "Controls the lightbulb colour - blue when OFF, green when ON"
  }')

echo "Create flag response: ${CREATE_RESPONSE}"
echo "Unleash seeding complete: lightbulb-colour flag created (disabled by default)"
