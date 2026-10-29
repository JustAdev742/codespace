#!/usr/bin/env bash
# Writes apps/ludora/.env for a new server, with fresh random secrets.
#   bash scripts/new-env.sh play.your-school.org "Your School" privacy@your-school.org
# Refuses to overwrite an existing .env: the database password and keys in it
# belong to data that already exists.
set -euo pipefail
cd "$(dirname "$0")/.."
domain=${1:?usage: new-env.sh <domain> [operator name] [operator contact]}
name=${2:-}
contact=${3:-}
if [ -e .env ]; then
  echo ".env already exists; not touching it." >&2
  exit 1
fi
case "$domain" in
  http://* | https://* | */*) echo "Give the domain alone, e.g. play.your-school.org" >&2; exit 1 ;;
esac
secret() { openssl rand -hex 32; }
umask 077
cat > .env <<ENV
# Written by scripts/new-env.sh on $(date -u +%Y-%m-%d). Never commit this file.
# Keep a copy of it somewhere safe: without POSTGRES_PASSWORD, IP_HASH_KEY and
# CHAOS_SECRET a restored backup still works, but sign-in rate limits and the
# secret lantern start afresh.
# Every docker compose command here includes the HTTPS proxy (compose.https.yaml).
COMPOSE_FILE=compose.yaml:compose.https.yaml
DOMAIN=$domain
PUBLIC_ORIGIN=https://$domain
POSTGRES_PASSWORD=$(secret)
IP_HASH_KEY=$(secret)
CHAOS_SECRET=$(secret)
OPERATOR_NAME=$name
OPERATOR_CONTACT=$contact
APP_ENV=production
TRUST_PROXY=true
COOKIE_SECURE=true
# Optional: AI question drafts (staff also switch on the ai.question_drafts flag).
# ANTHROPIC_API_KEY=
ENV
echo "Wrote .env for https://$domain (readable only by you)."
[ -n "$name" ] || echo "Set OPERATOR_NAME and OPERATOR_CONTACT in .env before students use it: the privacy policy names them."
