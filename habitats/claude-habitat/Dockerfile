FROM node:20-bookworm

# Install essential system dependencies (development tools via habitat tools)
RUN apt-get update && apt-get install -y \
    vim \
    curl \
    git \
    sudo \
    wget \
    && rm -rf /var/lib/apt/lists/*


# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Use existing node user (UID 1000) and give it sudo access
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create docker group for when Docker is installed via habitat tools
RUN groupadd -f docker && usermod -aG docker node

# Create workspace directory structure with proper permissions
RUN mkdir -p /workspace && \
    chown -R node:node /workspace && \
    mkdir -p /home/node/.claude && \
    chown -R node:node /home/node/.claude && \
    chmod 755 /home/node/.claude

# Copy habitat initialization script
COPY habitat-init.sh /usr/local/bin/habitat-init
RUN chmod +x /usr/local/bin/habitat-init

USER node
WORKDIR /workspace

# Clear any inherited entrypoint and use our init script
ENTRYPOINT []
CMD ["/usr/local/bin/habitat-init"]