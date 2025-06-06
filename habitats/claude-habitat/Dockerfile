FROM node:20-bookworm

# Install development tools
RUN apt-get update && apt-get install -y \
    git \
    vim \
    curl \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Use existing node user (UID 1000) and give it sudo access
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up workspace
RUN mkdir -p /workspace && \
    chown -R node:node /workspace

# Create a simple init script that keeps container running
RUN echo '#!/bin/bash\nwhile true; do sleep 3600; done' > /sbin/init && chmod +x /sbin/init

USER node
WORKDIR /workspace

# Use simple init script
CMD ["/sbin/init"]