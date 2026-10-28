#!/usr/bin/env bash
# Runs once, when the dev container is created: install Ludora and build it.
set -euo pipefail
cd "$(dirname "$0")/../apps/ludora"
npm ci
npm run build
npm run build:demo
