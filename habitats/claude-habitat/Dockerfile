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

# Create docker group with detected host GID and add node user
RUN groupadd -g ${DOCKER_GROUP_GID} docker && \
    usermod -aG docker node

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