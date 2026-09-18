#!/usr/bin/env bash
set -euo pipefail
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_ENABLE_AUTO_PIN=0
corepack pnpm@10.33.0 install --frozen-lockfile
corepack pnpm@10.33.0 db:migrate
corepack pnpm@10.33.0 db:seed
corepack pnpm@10.33.0 build
