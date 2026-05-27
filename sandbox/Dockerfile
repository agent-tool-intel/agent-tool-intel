FROM node:22-alpine

# Isolated sandbox for testing MCP servers
# --network none at runtime, --read-only filesystem

RUN addgroup -S sandbox && adduser -S sandbox -G sandbox
RUN mkdir -p /tmp/sandbox && chown sandbox:sandbox /tmp/sandbox

WORKDIR /tmp/sandbox
USER sandbox

# Install test-runner
COPY test-runner.js /tmp/sandbox/test-runner.js

ENTRYPOINT ["node", "/tmp/sandbox/test-runner.js"]
