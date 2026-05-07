#!/usr/bin/env bash

set -euo pipefail

if ! command -v agave-validator >/dev/null 2>&1; then
  echo "agave-validator not found in PATH"
  exit 1
fi

if ! command -v solana >/dev/null 2>&1; then
  echo "solana CLI not found in PATH"
  exit 1
fi

echo "agave-validator: $(agave-validator --version)"
echo "solana: $(solana --version)"

echo "Preflight checks passed."
