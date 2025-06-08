# Running Commands in Active Claude Habitat

## Quick Reference

When Claude Habitat is running, you can interact with the container using these commands:

### 1. Get Container Name
```bash
# Find the running claude-habitat container
docker ps | grep claude-habitat
```

### 2. Execute Commands in Running Container
```bash
# Get the container name from docker ps, then:
CONTAINER_NAME="claude-habitat_1749350094096_275671"  # Replace with actual name

# Run interactive bash session
docker exec -it $CONTAINER_NAME bash

# Run single commands as the node user
docker exec -it -u node $CONTAINER_NAME bash
docker exec -u node $CONTAINER_NAME ls -la /workspace
docker exec -u node $CONTAINER_NAME git status

# Check Claude's current working directory
docker exec -u node $CONTAINER_NAME pwd
```

### 3. Monitor Claude's Activity
```bash
# Watch logs from the container
docker logs -f $CONTAINER_NAME

# Monitor system processes in container
docker exec -u node $CONTAINER_NAME ps aux

# Check what Claude is working on
docker exec -u node $CONTAINER_NAME git log --oneline -5
docker exec -u node $CONTAINER_NAME git status
```

### 4. Quick Status Checks
```bash
# Check if Claude is still running
docker exec $CONTAINER_NAME ps aux | grep claude

# See current git state
docker exec -u node $CONTAINER_NAME git branch
docker exec -u node $CONTAINER_NAME git status --short
```

## Current Running Session

Right now you have:
- **Container**: `claude-habitat_1749350094096_275671`
- **Claude PID**: `276241` (running inside container)
- **Task**: Creating test branch, adding file, making PR

## Example Interactive Session

```bash
# Start interactive session in the running container
docker exec -it -u node claude-habitat_1749350094096_275671 bash

# Once inside, you can:
cd /workspace
git status
git log --oneline -3
ls -la
# ... any other commands
```

## Why Claude Appears to "Hang"

Claude is actually working! The test script executes Claude with a complex task:
- Create new feature branch 'test-push-from-habitat'
- Add a file
- Push to remote
- Submit a pull request
- Clean up afterwards

This is a multi-step process that takes time, especially if Claude is being thorough.

## Monitoring Progress

You can watch what Claude is doing:

```bash
# Check git activity
docker exec -u node claude-habitat_1749350094096_275671 git log --oneline -5

# Check if new branches were created
docker exec -u node claude-habitat_1749350094096_275671 git branch -a

# See if files were added
docker exec -u node claude-habitat_1749350094096_275671 git status

# Check for recent commits
docker exec -u node claude-habitat_1749350094096_275671 git log --since="5 minutes ago" --oneline
```