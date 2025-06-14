FROM node:20-bookworm

# Accept build argument for docker group GID
ARG DOCKER_GROUP_GID=999

# Install essential system dependencies including Docker
RUN apt-get update && apt-get install -y \
    vim \
    curl \
    git \
    sudo \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CE
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/* && \
    groupdel docker || true

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Use existing node user (UID 1000) and give it sudo access
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Add node user to docker group (create group if it doesn't exist)
# Use || true to continue even if group operations fail
RUN (getent group docker >/dev/null 2>&1 && echo "Docker group exists") || \
    (groupadd -g ${DOCKER_GROUP_GID} docker && echo "Created docker group") && \
    (usermod -aG docker node && echo "Added node to docker group") || \
    echo "Warning: Could not add node to docker group, will run without Docker access"

# Create workspace directory structure with proper permissions
RUN mkdir -p /workspace && \
    chown -R node:node /workspace && \
    mkdir -p /home/node/.claude && \
    chown -R node:node /home/node/.claude && \
    chmod 755 /home/node/.claude

# No initialization script needed - handled by lifecycle hooks

USER node
WORKDIR /workspace

# Clear any inherited entrypoint
ENTRYPOINT []
CMD ["/bin/bash"]