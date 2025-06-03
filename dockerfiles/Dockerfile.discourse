# Dockerfile for Claude Code Discourse Development
# Extends the standard Discourse development image with Claude Code and GitHub CLI pre-installed

ARG DISCOURSE_IMAGE=discourse/discourse_dev:release
FROM $DISCOURSE_IMAGE

# Install Claude Code globally as root
RUN npm install -g @anthropic-ai/claude-code

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt update && \
    apt install -y gh && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

# Pre-configure git to trust /src directory
RUN git config --global --add safe.directory /src

# Set up Claude Code Bot as default git user
RUN git config --global user.name "Claude Code Bot" && \
    git config --global user.email "claude-code@anthropic.com"

# Ensure the boot process starts services properly
CMD ["/sbin/boot"]