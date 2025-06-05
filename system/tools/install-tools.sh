#!/bin/bash

# Claude Habitat Tools Installer
# Downloads and installs static binaries for development tools

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_CONFIG="${SCRIPT_DIR}/tools.yaml"
USER_TOOLS_CONFIG="${SCRIPT_DIR}/user-tools.yaml"
BIN_DIR="${SCRIPT_DIR}/bin"
TEMP_DIR="${SCRIPT_DIR}/.tmp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

debug() {
    if [[ "${DEBUG:-}" == "1" ]]; then
        echo -e "${BLUE}[DEBUG]${NC} $*"
    fi
}

# Parse YAML (simple parser for our specific format)
parse_yaml() {
    local file="$1"
    local section="$2"
    local in_section=false
    local in_tool=false
    local current_tool=""
    
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^[[:space:]]*$ ]] && continue
        
        # Check for section start
        if [[ "$line" =~ ^${section}: ]]; then
            in_section=true
            continue
        fi
        
        # Check for other top-level sections (exit our section)
        if [[ "$line" =~ ^[a-z_]+: ]] && [[ "$in_section" == true ]]; then
            in_section=false
            break
        fi
        
        if [[ "$in_section" == true ]]; then
            # Check for tool start (- name:)
            if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name:[[:space:]]*(.+)$ ]]; then
                current_tool="${BASH_REMATCH[1]}"
                echo "TOOL_START:$current_tool"
                continue
            fi
            
            # Parse tool properties
            if [[ -n "$current_tool" ]] && [[ "$line" =~ ^[[:space:]]+([a-z_]+):[[:space:]]*(.*)$ ]]; then
                local key="${BASH_REMATCH[1]}"
                local value="${BASH_REMATCH[2]}"
                # Remove quotes if present
                value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/')
                echo "TOOL_PROP:$current_tool:$key:$value"
            fi
        fi
    done < "$file"
}

# Get latest version from GitHub API
get_latest_version() {
    local repo="$1"
    local version
    
    # Try to get latest version from GitHub API
    if command -v curl >/dev/null 2>&1; then
        version=$(curl -s "https://api.github.com/repos/$repo/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//')
    elif command -v wget >/dev/null 2>&1; then
        version=$(wget -qO- "https://api.github.com/repos/$repo/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//')
    else
        error "Neither curl nor wget available for downloading"
        return 1
    fi
    
    if [[ -z "$version" ]]; then
        error "Could not determine latest version for $repo"
        return 1
    fi
    
    echo "$version"
}

# Download and extract tool
install_tool() {
    local name="$1"
    local url="$2"
    local binary="$3"
    local extract_path="$4"
    local direct_binary="${5:-false}"
    
    log "Installing $name..."
    
    # Create temp directory
    mkdir -p "$TEMP_DIR"
    
    # Determine download URL with version replacement
    local download_url="$url"
    if [[ "$url" == *"{version}"* ]]; then
        # Extract repo from URL for version lookup
        local repo
        if [[ "$url" =~ github\.com/([^/]+/[^/]+) ]]; then
            repo="${BASH_REMATCH[1]}"
            local version
            version=$(get_latest_version "$repo")
            download_url="${url//\{version\}/$version}"
            extract_path="${extract_path//\{version\}/$version}"
        else
            error "Cannot determine repository for version lookup: $url"
            return 1
        fi
    fi
    
    debug "Download URL: $download_url"
    debug "Extract path: $extract_path"
    
    local filename
    filename=$(basename "$download_url")
    local temp_file="${TEMP_DIR}/${filename}"
    
    # Download
    log "Downloading $download_url..."
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$temp_file" "$download_url" --connect-timeout 10 --max-time 60
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$temp_file" "$download_url" --timeout=60
    else
        error "Neither curl nor wget available for downloading"
        return 1
    fi
    
    # Install binary
    if [[ "$direct_binary" == "true" ]]; then
        # Direct binary download
        cp "$temp_file" "${BIN_DIR}/${binary}"
        chmod +x "${BIN_DIR}/${binary}"
    else
        # Extract from archive
        local extract_dir="${TEMP_DIR}/extract_${name}"
        mkdir -p "$extract_dir"
        
        if [[ "$filename" == *.tar.gz ]] || [[ "$filename" == *.tgz ]]; then
            tar -xzf "$temp_file" -C "$extract_dir"
        elif [[ "$filename" == *.tar ]]; then
            tar -xf "$temp_file" -C "$extract_dir"
        elif [[ "$filename" == *.zip ]]; then
            if command -v unzip >/dev/null 2>&1; then
                unzip -q "$temp_file" -d "$extract_dir"
            else
                error "unzip not available for extracting $filename"
                return 1
            fi
        else
            error "Unsupported archive format: $filename"
            return 1
        fi
        
        # Find and copy binary
        local source_binary="${extract_dir}/${extract_path}"
        if [[ -f "$source_binary" ]]; then
            cp "$source_binary" "${BIN_DIR}/${binary}"
            chmod +x "${BIN_DIR}/${binary}"
        else
            error "Binary not found at expected path: $source_binary"
            debug "Available files in extract dir:"
            find "$extract_dir" -type f | head -20
            return 1
        fi
    fi
    
    # Cleanup temp files
    rm -f "$temp_file"
    rm -rf "${TEMP_DIR}/extract_${name}"
    
    log "✅ $name installed successfully"
}

# Process tools from YAML
process_tools() {
    local section="$1"
    local config_file="$2"
    
    if [[ ! -f "$config_file" ]]; then
        warn "Config file not found: $config_file"
        return 0
    fi
    
    local current_tool=""
    local tool_props=()
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^TOOL_START:(.+)$ ]]; then
            # Process previous tool if exists
            if [[ -n "$current_tool" ]]; then
                install_tool_from_props "$current_tool" "${tool_props[@]}"
            fi
            
            # Start new tool
            current_tool="${BASH_REMATCH[1]}"
            tool_props=()
        elif [[ "$line" =~ ^TOOL_PROP:([^:]+):([^:]+):(.*)$ ]]; then
            local tool="${BASH_REMATCH[1]}"
            local key="${BASH_REMATCH[2]}"
            local value="${BASH_REMATCH[3]}"
            
            if [[ "$tool" == "$current_tool" ]]; then
                tool_props+=("$key:$value")
            fi
        fi
    done < <(parse_yaml "$config_file" "$section")
    
    # Process last tool
    if [[ -n "$current_tool" ]]; then
        install_tool_from_props "$current_tool" "${tool_props[@]}"
    fi
}

# Install tool from parsed properties
install_tool_from_props() {
    local name="$1"
    shift
    local props=("$@")
    
    local url=""
    local binary=""
    local extract_path=""
    local direct_binary="false"
    local description=""
    
    # Parse properties
    for prop in "${props[@]}"; do
        local key="${prop%%:*}"
        local value="${prop#*:}"
        
        case "$key" in
            url) url="$value" ;;
            binary) binary="$value" ;;
            extract_path) extract_path="$value" ;;
            direct_binary) direct_binary="$value" ;;
            description) description="$value" ;;
        esac
    done
    
    # Validate required fields
    if [[ -z "$url" ]] || [[ -z "$binary" ]]; then
        error "Missing required fields for tool $name (url: $url, binary: $binary)"
        return 1
    fi
    
    # Set default extract path if not specified
    if [[ -z "$extract_path" ]] && [[ "$direct_binary" != "true" ]]; then
        extract_path="$binary"
    fi
    
    # Check if already installed
    if [[ -f "${BIN_DIR}/${binary}" ]]; then
        log "⏭️  $name already installed (${BIN_DIR}/${binary})"
        return 0
    fi
    
    # Install the tool
    if install_tool "$name" "$url" "$binary" "$extract_path" "$direct_binary"; then
        return 0
    else
        error "Failed to install $name"
        return 1
    fi
}

# List available tools
list_tools() {
    local config_file="$1"
    local section="$2"
    
    echo "Available tools in $section:"
    echo
    
    local current_tool=""
    local description=""
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^TOOL_START:(.+)$ ]]; then
            # Print previous tool if exists
            if [[ -n "$current_tool" ]]; then
                local status="❌ Not installed"
                if [[ -f "${BIN_DIR}/${current_tool}" ]]; then
                    status="✅ Installed"
                fi
                printf "  %-12s %s - %s\n" "$current_tool" "$status" "$description"
            fi
            
            # Start new tool
            current_tool="${BASH_REMATCH[1]}"
            description=""
        elif [[ "$line" =~ ^TOOL_PROP:([^:]+):description:(.*)$ ]]; then
            local tool="${BASH_REMATCH[1]}"
            local desc="${BASH_REMATCH[2]}"
            
            if [[ "$tool" == "$current_tool" ]]; then
                description="$desc"
            fi
        fi
    done < <(parse_yaml "$config_file" "$section")
    
    # Print last tool
    if [[ -n "$current_tool" ]]; then
        local status="❌ Not installed"
        if [[ -f "${BIN_DIR}/${current_tool}" ]]; then
            status="✅ Installed"
        fi
        printf "  %-12s %s - %s\n" "$current_tool" "$status" "$description"
    fi
    echo
}

# Main function
main() {
    local command="${1:-install}"
    
    case "$command" in
        install)
            log "Installing Claude Habitat tools..."
            mkdir -p "$BIN_DIR"
            
            # Install core tools
            log "Installing core tools..."
            process_tools "core_tools" "$TOOLS_CONFIG"
            
            # Install user tools if config exists
            if [[ -f "$USER_TOOLS_CONFIG" ]]; then
                log "Installing user tools..."
                process_tools "core_tools" "$USER_TOOLS_CONFIG"
                process_tools "optional_tools" "$USER_TOOLS_CONFIG"
            fi
            
            log "Tool installation complete!"
            log "Tools installed in: $BIN_DIR"
            ;;
            
        install-optional)
            log "Installing optional tools..."
            mkdir -p "$BIN_DIR"
            process_tools "optional_tools" "$TOOLS_CONFIG"
            ;;
            
        list)
            echo "Claude Habitat Tools Status"
            echo "=========================="
            echo
            list_tools "$TOOLS_CONFIG" "core_tools"
            list_tools "$TOOLS_CONFIG" "optional_tools"
            
            if [[ -f "$USER_TOOLS_CONFIG" ]]; then
                echo "User tools:"
                list_tools "$USER_TOOLS_CONFIG" "core_tools"
                list_tools "$USER_TOOLS_CONFIG" "optional_tools"
            fi
            ;;
            
        clean)
            log "Cleaning up tools..."
            rm -rf "$BIN_DIR"
            rm -rf "$TEMP_DIR"
            log "Tools cleaned up"
            ;;
            
        help|--help|-h)
            echo "Claude Habitat Tools Installer"
            echo
            echo "Usage: $0 [command]"
            echo
            echo "Commands:"
            echo "  install          Install core tools (default)"
            echo "  install-optional Install optional tools"
            echo "  list             List all available tools and status"
            echo "  clean            Remove all installed tools"
            echo "  help             Show this help"
            echo
            echo "Environment variables:"
            echo "  DEBUG=1          Enable debug output"
            ;;
            
        *)
            error "Unknown command: $command"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Cleanup on exit
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

main "$@"