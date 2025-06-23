#!/bin/bash
# Token regeneration script for Claude to use when authentication fails
# This ensures habitats never get stuck unable to push code
# Only regenerates token if current one expires in < 15 minutes

set -e

# Check if running in quiet mode (for git credential helper)
QUIET_MODE=${QUIET_MODE:-false}

# Logging function that respects quiet mode
log() {
    if [ "$QUIET_MODE" != "true" ]; then
        echo "$@"
    fi
}

# Check if we need to regenerate token
if [ -n "$GITHUB_TOKEN_EXPIRES" ] && [ -n "$GITHUB_TOKEN" ]; then
    current_time=$(date +%s)
    if [ "$GITHUB_TOKEN_EXPIRES" -gt $((current_time + 900)) ]; then
        # Token expires in > 15 minutes, no need to regenerate
        return 0 2>/dev/null || exit 0
    fi
fi

log "🔄 Regenerating GitHub App token..."

# Find the most recent PEM file by timestamp in filename
# Use SHARED_PATH environment variable

if [ -d "$SHARED_PATH" ]; then
    pem_file=$(find "$SHARED_PATH" -name "*.pem" -type f | sort -r | head -1)
else
    log "❌ Shared directory not found at $SHARED_PATH"
    exit 1
fi

if [ ! -f "$pem_file" ]; then
    log "❌ No PEM file found in $SHARED_PATH"
    exit 1
fi

if [ -z "$GITHUB_APP_ID" ]; then
    log "❌ GITHUB_APP_ID environment variable not set"
    exit 1
fi

log "🔑 Using PEM file: $(basename "$pem_file")"
log "🆔 App ID: $GITHUB_APP_ID"

# Generate JWT for GitHub App
header='{"alg":"RS256","typ":"JWT"}'
payload="{\"iat\":$(date +%s),\"exp\":$(($(date +%s) + 600)),\"iss\":\"$GITHUB_APP_ID\"}"

# Encode header and payload
header_b64=$(echo -n "$header" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
payload_b64=$(echo -n "$payload" | base64 -w 0 | tr '+/' '-_' | tr -d '=')

# Create signature
signature=$(echo -n "$header_b64.$payload_b64" | openssl dgst -sha256 -sign "$pem_file" | base64 -w 0 | tr '+/' '-_' | tr -d '=')

if [ -z "$signature" ]; then
    log "❌ Failed to create JWT signature"
    exit 1
fi

# Create JWT
jwt="$header_b64.$payload_b64.$signature"

log "✅ JWT generated successfully"

# Get installation token
log "🔗 Getting installation token..."
installations_response=$(curl -s -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations")
installation_id=$(echo "$installations_response" | "${SYSTEM_PATH}/tools/bin/jq" -r '.[0].id')

if [ "$installation_id" = "null" ] || [ -z "$installation_id" ]; then
    log "❌ Failed to get installation ID"
    log "Response: $installations_response"
    exit 1
fi

log "✅ Installation ID: $installation_id"

# Get access token
token_response=$(curl -s -X POST -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/$installation_id/access_tokens")
token=$(echo "$token_response" | "${SYSTEM_PATH}/tools/bin/jq" -r '.token')

if [ "$token" = "null" ] || [ -z "$token" ]; then
    log "❌ Failed to get access token"
    log "Response: $token_response"
    exit 1
fi

log "✅ New token generated: ${token:0:20}..."

# Extract expiration time from token response
token_expires_at=$(echo "$token_response" | "${SYSTEM_PATH}/tools/bin/jq" -r '.expires_at' 2>/dev/null || echo "")
if [ -n "$token_expires_at" ]; then
    # Convert to Unix timestamp
    token_expires_timestamp=$(date -d "$token_expires_at" +%s 2>/dev/null || echo "")
    if [ -n "$token_expires_timestamp" ]; then
        export GITHUB_TOKEN_EXPIRES=$token_expires_timestamp
        log "✅ Token expires at: $token_expires_at ($token_expires_timestamp)"
    fi
fi

export GITHUB_TOKEN=$token

# Test the new token
log "🧪 Testing new token..."
if curl -s -H "Authorization: token $token" "https://api.github.com/user" | "${SYSTEM_PATH}/tools/bin/jq" -r '.login' > /dev/null; then
    log "✅ Token test successful - authentication working"
    log ""
    log "🎉 GitHub App token regenerated successfully!"
    log "You can now push code again."
else
    log "❌ Token test failed - authentication may not be working"
    exit 1
fi
