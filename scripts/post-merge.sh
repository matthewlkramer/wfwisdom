#!/usr/bin/env bash
set -euo pipefail
corepack pnpm@10.33.0 install --frozen-lockfile
corepack pnpm@10.33.0 db:migrate
corepack pnpm@10.33.0 db:seed
corepack pnpm@10.33.0 build
