FROM node:20-bookworm

# Install development tools and Docker CLI
RUN apt-get update && apt-get install -y \
    git \
    vim \
    curl \
    sudo \
    tree \
    docker.io \
    wget \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt update \
    && apt install gh -y \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Use existing node user (UID 1000) and give it sudo access
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create docker group and add node user
RUN groupadd -f docker && usermod -aG docker node

# Create workspace directory structure with proper permissions
RUN mkdir -p /workspace && \
    chown -R node:node /workspace && \
    mkdir -p /home/node/.claude && \
    chown -R node:node /home/node/.claude && \
    chmod 755 /home/node/.claude

# Create a simple init script that keeps container running
# Use custom path since /sbin/init may be managed by systemd
RUN echo '#!/bin/bash\nwhile true; do sleep 3600; done' > /usr/local/bin/habitat-init && chmod +x /usr/local/bin/habitat-init

USER node
WORKDIR /workspace

# Clear any inherited entrypoint and use our init script
ENTRYPOINT []
CMD ["/usr/local/bin/habitat-init"]