#!/bin/bash
# Token regeneration script for Claude to use when authentication fails
# This ensures habitats never get stuck unable to push code
# Only regenerates token if current one expires in < 15 minutes

set -e

# Check if we need to regenerate token
if [ -n "$GITHUB_TOKEN_EXPIRES" ] && [ -n "$GITHUB_TOKEN" ]; then
    current_time=$(date +%s)
    if [ "$GITHUB_TOKEN_EXPIRES" -gt $((current_time + 900)) ]; then
        # Token expires in > 15 minutes, no need to regenerate
        return 0 2>/dev/null || exit 0
    fi
fi

echo "🔄 Regenerating GitHub App token..."

# Find the most recent PEM file by timestamp in filename
# Use SHARED_PATH environment variable or default to /habitat/shared
SHARED_PATH=${SHARED_PATH:-/habitat/shared}

if [ -d "$SHARED_PATH" ]; then
    pem_file=$(find "$SHARED_PATH" -name "*.pem" -type f | sort -r | head -1)
else
    echo "❌ Shared directory not found at $SHARED_PATH"
    exit 1
fi

if [ ! -f "$pem_file" ]; then
    echo "❌ No PEM file found in $SHARED_PATH"
    exit 1
fi

if [ -z "$GITHUB_APP_ID" ]; then
    echo "❌ GITHUB_APP_ID environment variable not set"
    exit 1
fi

echo "🔑 Using PEM file: $(basename "$pem_file")"
echo "🆔 App ID: $GITHUB_APP_ID"

# Generate JWT for GitHub App
header='{"alg":"RS256","typ":"JWT"}'
payload="{\"iat\":$(date +%s),\"exp\":$(($(date +%s) + 600)),\"iss\":\"$GITHUB_APP_ID\"}"

# Encode header and payload
header_b64=$(echo -n "$header" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
payload_b64=$(echo -n "$payload" | base64 -w 0 | tr '+/' '-_' | tr -d '=')

# Create signature
signature=$(echo -n "$header_b64.$payload_b64" | openssl dgst -sha256 -sign "$pem_file" | base64 -w 0 | tr '+/' '-_' | tr -d '=')

if [ -z "$signature" ]; then
    echo "❌ Failed to create JWT signature"
    exit 1
fi

# Create JWT
jwt="$header_b64.$payload_b64.$signature"

echo "✅ JWT generated successfully"

# Get installation token
echo "🔗 Getting installation token..."
installations_response=$(curl -s -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations")
installation_id=$(echo "$installations_response" | jq -r '.[0].id')

if [ "$installation_id" = "null" ] || [ -z "$installation_id" ]; then
    echo "❌ Failed to get installation ID"
    echo "Response: $installations_response"
    exit 1
fi

echo "✅ Installation ID: $installation_id"

# Get access token
token_response=$(curl -s -X POST -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/$installation_id/access_tokens")
token=$(echo "$token_response" | jq -r '.token')

if [ "$token" = "null" ] || [ -z "$token" ]; then
    echo "❌ Failed to get access token"
    echo "Response: $token_response"
    exit 1
fi

echo "✅ New token generated: ${token:0:20}..."

# Extract expiration time from token response
token_expires_at=$(echo "$token_response" | jq -r '.expires_at' 2>/dev/null || echo "")
if [ -n "$token_expires_at" ]; then
    # Convert to Unix timestamp
    token_expires_timestamp=$(date -d "$token_expires_at" +%s 2>/dev/null || echo "")
    if [ -n "$token_expires_timestamp" ]; then
        export GITHUB_TOKEN_EXPIRES=$token_expires_timestamp
        echo "✅ Token expires at: $token_expires_at ($token_expires_timestamp)"
    fi
fi

export GITHUB_TOKEN=$token

# Test the new token
echo "🧪 Testing new token..."
if curl -s -H "Authorization: token $token" "https://api.github.com/user" | jq -r '.login' > /dev/null; then
    echo "✅ Token test successful - authentication working"
    echo ""
    echo "🎉 GitHub App token regenerated successfully!"
    echo "You can now push code again."
else
    echo "❌ Token test failed - authentication may not be working"
    exit 1
fi
