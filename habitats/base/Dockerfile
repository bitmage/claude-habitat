# Minimal base habitat for testing system and shared components
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update and install basic dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    openssl \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /workspace && chmod 755 /workspace

# Set working directory
WORKDIR /workspace

# Create a simple init script
RUN echo '#!/bin/bash\nwhile true; do sleep 3600; done' > /sbin/init && chmod +x /sbin/init

# Default command
CMD ["/sbin/init"]