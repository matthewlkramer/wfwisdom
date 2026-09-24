#!/bin/bash
# Installs the workspace in Claude Code on the web, so a collaborator's cloud environment needs no setup
# script of its own. Local machines are left alone: people there run pnpm install themselves.
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi
cd "$CLAUDE_PROJECT_DIR"
# Not --frozen-lockfile: the container is cached after this runs, and plain install reuses that cache.
# The cloud image already ships Chromium for Playwright; don't fetch another copy.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
