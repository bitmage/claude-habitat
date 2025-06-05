# Dockerfile for Claude Code Discourse Development
# Extends the standard Discourse development image with Claude Code and GitHub CLI pre-installed

ARG DISCOURSE_IMAGE=discourse/discourse_dev:release
FROM $DISCOURSE_IMAGE

# Install Claude Code globally as root
RUN npm install -g @anthropic-ai/claude-code

# Install basic tools needed for downloading and extracting static binaries
RUN apt update && apt install -y curl wget unzip && \
    apt clean && rm -rf /var/lib/apt/lists/*

# Set up Claude Habitat tools directory structure
RUN mkdir -p /claude-habitat/shared/tools/bin

# Add tools to PATH for all users
RUN echo 'export PATH="/claude-habitat/shared/tools/bin:$PATH"' >> /etc/profile && \
    echo 'export PATH="/claude-habitat/shared/tools/bin:$PATH"' >> /etc/bash.bashrc

# Pre-configure git to trust /src directory
RUN git config --global --add safe.directory /src

# Set up Claude Code Bot as default git user
RUN git config --global user.name "Claude Code Bot" && \
    git config --global user.email "claude-code@anthropic.com"

# Ensure the boot process starts services properly
CMD ["/sbin/boot"]