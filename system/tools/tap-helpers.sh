#!/bin/bash
# TAP (Test Anything Protocol) helpers for shell tests
# Provides simple functions to output TAP-compliant test results

# Global test counter
test_num=1

# Start a TAP test session
# Usage: tap_start <number_of_tests>
tap_start() {
    echo "TAP version 13"
    if [ -n "$1" ]; then
        echo "1..$1"
    fi
    test_num=1
}

# Report a passing test
# Usage: tap_ok "test description"
tap_ok() {
    echo "ok $test_num - $1"
    ((test_num++))
}

# Report a failing test
# Usage: tap_not_ok "test description" ["diagnostic message"]
tap_not_ok() {
    echo "not ok $test_num - $1"
    if [ -n "${2:-}" ]; then
        echo "# $2"
    fi
    ((test_num++))
}

# Report a skipped test
# Usage: tap_skip "test description" ["reason"]
tap_skip() {
    echo "ok $test_num - $1 # SKIP${2:+ $2}"
    ((test_num++))
}

# Output diagnostic information
# Usage: tap_diag "diagnostic message"
tap_diag() {
    echo "# $1"
}

# Conditional test helper
# Usage: tap_test "condition" "test description" ["failure message"]
tap_test() {
    local condition="$1"
    local description="$2"
    local failure_msg="$3"
    
    if eval "$condition"; then
        tap_ok "$description"
        return 0
    else
        tap_not_ok "$description" "$failure_msg"
        return 1
    fi
}

# Check if command exists
# Usage: tap_has_command "command" "test description"
tap_has_command() {
    local cmd="$1"
    local description="$2"
    
    if command -v "$cmd" >/dev/null 2>&1; then
        tap_ok "$description"
        return 0
    else
        tap_not_ok "$description" "Command '$cmd' not found"
        return 1
    fi
}

# Check if file exists
# Usage: tap_has_file "/path/to/file" "test description"
tap_has_file() {
    local file="$1"
    local description="$2"
    
    if [ -f "$file" ]; then
        tap_ok "$description"
        return 0
    else
        tap_not_ok "$description" "File '$file' not found"
        return 1
    fi
}

# Check if directory exists
# Usage: tap_has_dir "/path/to/dir" "test description"
tap_has_dir() {
    local dir="$1"
    local description="$2"
    
    if [ -d "$dir" ]; then
        tap_ok "$description"
        return 0
    else
        tap_not_ok "$description" "Directory '$dir' not found"
        return 1
    fi
}

# Check environment variable
# Usage: tap_has_env "VAR_NAME" "test description"
tap_has_env() {
    local var="$1"
    local description="$2"
    
    if [ -n "${!var}" ]; then
        tap_ok "$description"
        return 0
    else
        tap_not_ok "$description" "Environment variable '$var' not set or empty"
        return 1
    fi
}