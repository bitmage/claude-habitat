#!/bin/bash

# Claude Habitat - Isolated development environments for Claude Code
# This script creates completely isolated Docker containers for Claude Code development

set -e

# Default values
CONFIG_FILE=""
CONFIG_DIR="$(dirname "$0")/configs"
DOCKERFILES_DIR="$(dirname "$0")/dockerfiles"
EXTRA_REPOS=()
CLEAN_MODE=false
LIST_MODE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

OPTIONS:
    -c, --config FILE       Path to configuration YAML file
    -r, --repo REPO_SPEC    Additional repository to clone (format: URL:PATH[:BRANCH])
                           Can be specified multiple times
    --clean                 Remove all Claude Habitat Docker images
    --list-configs          List available configuration files
    -h, --help             Display this help message

EXAMPLES:
    # Use a configuration file
    $0 --config discourse.yaml

    # Override/add repositories
    $0 --config discourse.yaml --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

    # List available configs
    $0 --list-configs

EOF
}

# Function to parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -r|--repo)
                EXTRA_REPOS+=("$2")
                shift 2
                ;;
            --clean)
                CLEAN_MODE=true
                shift
                ;;
            --list-configs)
                LIST_MODE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                usage
                exit 1
                ;;
        esac
    done
}

# Function to list available configs
list_configs() {
    echo "Available configurations:"
    echo ""
    if [ -d "$CONFIG_DIR" ]; then
        for config in "$CONFIG_DIR"/*.yaml "$CONFIG_DIR"/*.yml; do
            if [ -f "$config" ]; then
                basename "$config"
            fi
        done
    else
        echo "No configurations found in $CONFIG_DIR"
    fi
}

# Function to clean Docker images
clean_images() {
    echo "Cleaning Claude Habitat Docker images..."
    docker images --format "{{.Repository}}:{{.Tag}}" | grep "^claude-habitat-" | while read -r image; do
        echo "Removing $image..."
        docker rmi "$image" || true
    done
    echo "Clean complete."
}

# Function to check dependencies
check_dependencies() {
    local deps=("docker" "git")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    # Check for YAML parser
    if ! command -v yq &> /dev/null && ! command -v python3 &> /dev/null; then
        missing+=("yq or python3")
    fi
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}Missing dependencies: ${missing[*]}${NC}"
        echo "Please install the missing dependencies and try again."
        exit 1
    fi
}

# Function to parse YAML using available tools
parse_yaml() {
    local yaml_file="$1"
    local query="$2"
    local script_dir="$(dirname "$0")"
    
    if [ -f "$script_dir/yaml_parser.py" ] && command -v python3 &> /dev/null; then
        python3 "$script_dir/yaml_parser.py" "$yaml_file" "$query"
    elif command -v yq &> /dev/null; then
        yq eval "$query" "$yaml_file"
    else
        echo -e "${RED}No YAML parser found. Install yq or ensure python3 is available.${NC}"
        exit 1
    fi
}

# Function to build Docker image if needed
build_image() {
    local config_file="$1"
    
    # Parse image configuration
    local dockerfile=$(parse_yaml "$config_file" ".image.dockerfile")
    local image_tag=$(parse_yaml "$config_file" ".image.tag")
    local build_args=$(parse_yaml "$config_file" ".image.build_args")
    
    # Use absolute path for dockerfile
    if [[ ! "$dockerfile" = /* ]]; then
        dockerfile="$(dirname "$config_file")/$dockerfile"
    fi
    
    # Check if image already exists
    if docker image inspect "$image_tag" &>/dev/null; then
        echo "Using existing image: $image_tag"
        return 0
    fi
    
    echo "Building Docker image: $image_tag"
    echo "Using Dockerfile: $dockerfile"
    
    # Build the image
    local build_cmd="docker build -f $dockerfile -t $image_tag"
    
    # Add build args if any
    if [ -n "$build_args" ]; then
        while IFS= read -r arg; do
            # Skip empty lines and list markers
            if [ -z "$arg" ] || [ "$arg" = "---" ]; then
                continue
            fi
            # Remove leading "- " if present
            arg="${arg#- }"
            if [[ "$arg" =~ ^([^=]+)=(.+)$ ]]; then
                build_cmd+=" --build-arg $arg"
            fi
        done <<< "$build_args"
    fi
    
    build_cmd+=" $(dirname "$dockerfile")"
    
    echo "Build command: $build_cmd"
    eval "$build_cmd"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to build Docker image${NC}"
        exit 1
    fi
}

# Function to clone repository
clone_repository() {
    local repo_spec="$1"
    local container="$2"
    
    # Parse repo spec: URL:PATH[:BRANCH]
    # First, find where the URL ends (look for :/ pattern that's not ://)
    local url=""
    local remainder=""
    
    # Extract URL (handles https://, git://, etc.)
    if [[ "$repo_spec" =~ ^(https?://[^:]+|git://[^:]+|[^:]+@[^:]+:[^:]+):(.+)$ ]]; then
        url="${BASH_REMATCH[1]}"
        remainder="${BASH_REMATCH[2]}"
    else
        echo -e "${RED}Invalid repository spec: $repo_spec${NC}"
        return 1
    fi
    
    # Now parse the remainder for path and optional branch
    if [[ "$remainder" =~ ^([^:]+)(:(.+))?$ ]]; then
        path="${BASH_REMATCH[1]}"
        branch="${BASH_REMATCH[3]}"
    else
        path="$remainder"
        branch=""
    fi
    
    # Default branch to main if not specified
    branch=${branch:-main}
    
    echo "Cloning $url to $path (branch: $branch)"
    
    # Clone inside the container
    docker exec "$container" bash -c "
        # Ensure parent directory exists
        mkdir -p \$(dirname $path)
        
        # Clone the repository
        git clone --depth 1 --branch $branch $url $path
        
        # Add safe directory
        git config --global --add safe.directory $path
        
        # Set ownership to discourse user (1000:1000)
        chown -R 1000:1000 $path
    "
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to clone repository: $url${NC}"
        return 1
    fi
    
    echo "Successfully cloned $url"
}

# Function to run setup commands
run_setup_commands() {
    local config_file="$1"
    local container="$2"
    
    # Run root commands
    local root_commands=$(parse_yaml "$config_file" ".setup.root")
    if [ -n "$root_commands" ]; then
        echo "Running root setup commands..."
        # Parse list of commands (each starting with "- ")
        local cmd_buffer=""
        local in_command=false
        
        while IFS= read -r line; do
            if [[ "$line" =~ ^-[[:space:]]+(.*) ]]; then
                # Start of a new command, execute previous if any
                if [ "$in_command" = true ] && [ -n "$cmd_buffer" ]; then
                    echo "Executing root command:"
                    echo "$cmd_buffer"
                    docker exec "$container" bash -c "$cmd_buffer"
                fi
                # Start new command
                cmd_buffer="${BASH_REMATCH[1]}"
                in_command=true
            elif [ "$in_command" = true ]; then
                # Continue building the command
                cmd_buffer="$cmd_buffer"$'\n'"$line"
            fi
        done <<< "$root_commands"
        
        # Execute the last command
        if [ "$in_command" = true ] && [ -n "$cmd_buffer" ]; then
            echo "Executing root command:"
            echo "$cmd_buffer"
            docker exec "$container" bash -c "$cmd_buffer"
        fi
    fi
    
    # Run user commands
    local run_as=$(parse_yaml "$config_file" ".setup.user.run_as")
    local user_commands=$(parse_yaml "$config_file" ".setup.user.commands")
    
    if [ -n "$user_commands" ] && [ -n "$run_as" ]; then
        echo "Running user setup commands as $run_as..."
        # Parse list of commands (each starting with "- ")
        local cmd_buffer=""
        local in_command=false
        
        while IFS= read -r line; do
            if [[ "$line" =~ ^-[[:space:]]+(.*) ]]; then
                # Start of a new command, execute previous if any
                if [ "$in_command" = true ] && [ -n "$cmd_buffer" ]; then
                    echo "Executing user command as $run_as:"
                    echo "$cmd_buffer"
                    docker exec -u "$run_as" "$container" bash -c "$cmd_buffer"
                fi
                # Start new command
                cmd_buffer="${BASH_REMATCH[1]}"
                in_command=true
            elif [ "$in_command" = true ]; then
                # Continue building the command
                cmd_buffer="$cmd_buffer"$'\n'"$line"
            fi
        done <<< "$user_commands"
        
        # Execute the last command
        if [ "$in_command" = true ] && [ -n "$cmd_buffer" ]; then
            echo "Executing user command as $run_as:"
            echo "$cmd_buffer"
            docker exec -u "$run_as" "$container" bash -c "$cmd_buffer"
        fi
    fi
}

# Main function
main() {
    local config_file="$1"
    
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}Configuration file not found: $config_file${NC}"
        exit 1
    fi
    
    echo "Using configuration: $config_file"
    
    # Parse configuration
    local name=$(parse_yaml "$config_file" ".name")
    local image_tag=$(parse_yaml "$config_file" ".image.tag")
    local init_command=$(parse_yaml "$config_file" ".container.init_command")
    local work_dir=$(parse_yaml "$config_file" ".container.work_dir")
    local container_user=$(parse_yaml "$config_file" ".container.user")
    local startup_delay=$(parse_yaml "$config_file" ".container.startup_delay")
    local claude_command=$(parse_yaml "$config_file" ".claude.command")
    local instructions_file=$(parse_yaml "$config_file" ".claude.instructions_file")
    
    # Set defaults
    init_command=${init_command:-/sbin/boot}
    work_dir=${work_dir:-/src}
    container_user=${container_user:-root}
    startup_delay=${startup_delay:-5}
    claude_command=${claude_command:-claude}
    
    # Build image if needed
    build_image "$config_file"
    
    # Create container name
    local container_name="${name}_$(date +%s)_$$"
    
    echo "Creating container: $container_name"
    
    # Collect environment variables and volumes as arrays
    local docker_args=()
    local env_list=$(parse_yaml "$config_file" ".environment")
    if [ -n "$env_list" ]; then
        while IFS= read -r env; do
            if [ -n "$env" ] && [ "$env" != "---" ]; then
                # Remove leading "- " if present
                env="${env#- }"
                # Special handling for GITHUB_APP_PRIVATE_KEY_FILE
                if [[ "$env" == "GITHUB_APP_PRIVATE_KEY_FILE="* ]]; then
                    # Extract the file path
                    local key_file="${env#GITHUB_APP_PRIVATE_KEY_FILE=}"
                    # Expand the path relative to config directory
                    if [[ ! "$key_file" = /* ]]; then
                        key_file="$(dirname "$config_file")/$key_file"
                    fi
                    # Mount the key file if it exists
                    if [ -f "$key_file" ]; then
                        docker_args+=("-v" "$key_file:/tmp/github-app-key.pem:ro")
                        docker_args+=("-e" "GITHUB_APP_PRIVATE_KEY_FILE=/tmp/github-app-key.pem")
                    else
                        echo -e "${YELLOW}Warning: GitHub App private key file not found: $key_file${NC}"
                    fi
                else
                    # Add environment variable
                    docker_args+=("-e" "$env")
                fi
            fi
        done <<< "$env_list"
    fi
    
    # Create container
    docker run -d \
        --name "$container_name" \
        "${docker_args[@]}" \
        "$image_tag" \
        $init_command
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create container${NC}"
        exit 1
    fi
    
    # Set up cleanup trap
    cleanup() {
        echo ""
        echo "Cleaning up container..."
        docker stop "$container_name" 2>/dev/null || true
        docker rm "$container_name" 2>/dev/null || true
    }
    trap cleanup EXIT
    
    # Wait for container to start
    echo "Waiting for container to initialize..."
    sleep "$startup_delay"
    
    # Check if container is still running
    if ! docker ps -q -f name="$container_name" | grep -q .; then
        echo -e "${RED}Container exited unexpectedly. Checking logs:${NC}"
        docker logs "$container_name" | tail -20
        exit 1
    fi
    
    # Clone repositories from config
    local repos=$(parse_yaml "$config_file" ".repositories")
    if [ -n "$repos" ]; then
        echo "Cloning repositories from configuration..."
        local repo_idx=0
        while true; do
            local repo_url=$(parse_yaml "$config_file" ".repositories.[$repo_idx].url")
            local repo_path=$(parse_yaml "$config_file" ".repositories.[$repo_idx].path")
            local repo_branch=$(parse_yaml "$config_file" ".repositories.[$repo_idx].branch")
            
            if [ -z "$repo_url" ]; then
                break
            fi
            
            echo "Processing repository $repo_idx: $repo_url"
            
            if ! clone_repository "$repo_url:$repo_path:$repo_branch" "$container_name"; then
                echo -e "${RED}Failed to clone repository: $repo_url${NC}"
                echo "Continuing without this repository..."
                # Don't exit, just skip this repo
            fi
            repo_idx=$((repo_idx + 1))
        done
    fi
    
    # Clone extra repositories from command line
    if [ ${#EXTRA_REPOS[@]} -gt 0 ]; then
        echo "Cloning additional repositories from command line..."
        for repo in "${EXTRA_REPOS[@]}"; do
            clone_repository "$repo" "$container_name"
        done
    fi
    
    # Look for instructions file in the main repository
    if [ -n "$instructions_file" ]; then
        echo "Looking for instructions file: $instructions_file"
        docker exec "$container_name" bash -c "
            if [ -f $work_dir/$instructions_file ]; then
                echo 'Found $instructions_file, copying to CLAUDE.md'
                cp $work_dir/$instructions_file $work_dir/CLAUDE.md
            else
                echo 'Instructions file not found: $work_dir/$instructions_file'
            fi
        "
    fi
    
    # Run setup commands
    echo "Running setup commands..."
    run_setup_commands "$config_file" "$container_name"
    
    # Check if container is still running after setup
    if ! docker ps -q -f name="$container_name" | grep -q .; then
        echo -e "${RED}Container exited during setup. Checking logs:${NC}"
        docker logs "$container_name" | tail -30
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}Container ready!${NC}"
    echo "Launching Claude Code..."
    echo ""
    
    # Launch Claude Code
    echo "Executing: docker exec -it -u $container_user -w $work_dir $container_name $claude_command"
    exec docker exec \
        -it \
        -u "$container_user" \
        -w "$work_dir" \
        "$container_name" \
        $claude_command
}

# Parse command line arguments
parse_args "$@"

# Handle special modes
if [ "$LIST_MODE" = true ]; then
    list_configs
    exit 0
fi

if [ "$CLEAN_MODE" = true ]; then
    clean_images
    exit 0
fi

# Check dependencies
check_dependencies

# Require config file
if [ -z "$CONFIG_FILE" ]; then
    # Look for default config
    if [ -f "$CONFIG_DIR/default.yaml" ]; then
        CONFIG_FILE="$CONFIG_DIR/default.yaml"
    else
        echo -e "${RED}No configuration file specified${NC}"
        usage
        exit 1
    fi
fi

# Make config path absolute
if [[ ! "$CONFIG_FILE" = /* ]]; then
    # Check if it's just a filename (look in configs dir)
    if [ -f "$CONFIG_DIR/$CONFIG_FILE" ]; then
        CONFIG_FILE="$CONFIG_DIR/$CONFIG_FILE"
    else
        CONFIG_FILE="$(pwd)/$CONFIG_FILE"
    fi
fi

# Run main function
main "$CONFIG_FILE"