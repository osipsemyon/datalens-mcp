#!/bin/sh
# Optional launcher for datalens-mcp. Point your MCP client's `command` at this script.
#
# It resolves the repo automatically and (optionally) mints a fresh Yandex IAM token at every start,
# so you don't have to paste a new token every ~12h. Two ways to provide the token:
#
#   1. DATALENS_USE_YC_TOKEN=1  -> runs `yc iam create-token` at startup (nothing stored on disk;
#      the browser is only needed once for `yc init`). Requires the yc CLI on PATH and logged in.
#   2. otherwise -> relies on DATALENS_IAM_TOKEN already in the environment or in a `.env` file
#      (the server auto-loads `.env`). Set DATALENS_ORG_ID too.
#
# Config is read from the environment and/or `<repo>/.env`. If your MCP client launches with a
# minimal PATH, replace `yc` / `node` below with absolute paths (e.g. /opt/homebrew/bin/yc).

set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)" # repo root (this script lives in bin/)

# Decide whether to mint a token via yc — honor a real env var, else read it from .env (no sourcing).
USE_YC="$DATALENS_USE_YC_TOKEN"
if [ -z "$USE_YC" ] && [ -f "$DIR/.env" ]; then
  # strip the value, trailing spaces, and surrounding quotes (the node .env loader strips them too)
  USE_YC="$(grep -E '^[[:space:]]*DATALENS_USE_YC_TOKEN[[:space:]]*=' "$DIR/.env" | tail -1 | sed -E "s/^[^=]*=[[:space:]]*//; s/[[:space:]]*\$//; s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/")"
fi

if [ "$USE_YC" = "1" ] || [ "$USE_YC" = "true" ]; then
  TOKEN="$(yc iam create-token 2>/dev/null || true)"
  if [ -z "$TOKEN" ]; then
    echo "datalens-launch: 'yc iam create-token' failed — is the yc CLI installed and logged in (run 'yc init')?" >&2
    exit 1
  fi
  export DATALENS_IAM_TOKEN="$TOKEN"
fi

exec node "$DIR/dist/index.js"
