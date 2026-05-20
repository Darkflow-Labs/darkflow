#!/usr/bin/env bash

set -euo pipefail

ENV_FILE="${BEDROCK_ENV_FILE:-./config/rpc.testnet.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Agave snapshot rebuild can panic on some local macOS setups when Rayon fan-out is high.
# Keep a very conservative default for local/dev runs; users can override in env.
if [[ "$(uname -s)" == "Darwin" ]]; then
  export RAYON_NUM_THREADS="${BEDROCK_RAYON_NUM_THREADS:-1}"
  # Keep Solana-side Rayon config in lockstep where consumed.
  export SOLANA_RAYON_THREADS="$RAYON_NUM_THREADS"
fi

required_vars=(
  BEDROCK_IDENTITY_KEYPAIR
  BEDROCK_LEDGER_DIR
  BEDROCK_ACCOUNTS_DIR
  BEDROCK_LOG_PATH
  BEDROCK_RPC_PORT
  BEDROCK_RPC_BIND_ADDRESS
  BEDROCK_DYNAMIC_PORT_RANGE
  BEDROCK_ENTRYPOINT_1
  BEDROCK_EXPECTED_GENESIS_HASH
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var: $var_name"
    exit 1
  fi
done

args=(
  --identity "$BEDROCK_IDENTITY_KEYPAIR"
  --ledger "$BEDROCK_LEDGER_DIR"
  --accounts "$BEDROCK_ACCOUNTS_DIR"
  --log "$BEDROCK_LOG_PATH"
  --rpc-port "$BEDROCK_RPC_PORT"
  --rpc-bind-address "$BEDROCK_RPC_BIND_ADDRESS"
  --dynamic-port-range "$BEDROCK_DYNAMIC_PORT_RANGE"
  --entrypoint "$BEDROCK_ENTRYPOINT_1"
  --expected-genesis-hash "$BEDROCK_EXPECTED_GENESIS_HASH"
  --wal-recovery-mode skip_any_corrupted_record
  --no-port-check
  --no-os-network-limits-test
)

if [[ -n "${BEDROCK_ENTRYPOINT_2:-}" ]]; then
  args+=(--entrypoint "$BEDROCK_ENTRYPOINT_2")
fi
if [[ -n "${BEDROCK_ENTRYPOINT_3:-}" ]]; then
  args+=(--entrypoint "$BEDROCK_ENTRYPOINT_3")
fi

if [[ -n "${BEDROCK_KNOWN_VALIDATOR_1:-}" ]]; then
  args+=(--known-validator "$BEDROCK_KNOWN_VALIDATOR_1")
fi
if [[ -n "${BEDROCK_KNOWN_VALIDATOR_2:-}" ]]; then
  args+=(--known-validator "$BEDROCK_KNOWN_VALIDATOR_2")
fi
if [[ -n "${BEDROCK_KNOWN_VALIDATOR_3:-}" ]]; then
  args+=(--known-validator "$BEDROCK_KNOWN_VALIDATOR_3")
fi
if [[ -n "${BEDROCK_KNOWN_VALIDATOR_4:-}" ]]; then
  args+=(--known-validator "$BEDROCK_KNOWN_VALIDATOR_4")
fi

if [[ "${BEDROCK_FULL_RPC_API:-true}" == "true" ]]; then
  args+=(--full-rpc-api)
fi
if [[ "${BEDROCK_NO_VOTING:-true}" == "true" ]]; then
  args+=(--no-voting)
fi
if [[ "${BEDROCK_NO_POH_SPEED_TEST:-true}" == "true" ]]; then
  # Hidden from default --help; set SOLANA_NO_HIDDEN_CLI_ARGS=1 to list it.
  args+=(--no-poh-speed-test)
fi
if [[ "${BEDROCK_PRIVATE_RPC:-true}" == "true" ]]; then
  args+=(--private-rpc)
fi
if [[ "${BEDROCK_LIMIT_LEDGER_SIZE:-true}" == "true" ]]; then
  args+=(--limit-ledger-size)
fi
if [[ -n "${BEDROCK_GEYSER_PLUGIN_CONFIG:-}" && -f "${BEDROCK_GEYSER_PLUGIN_CONFIG}" ]]; then
  geyser_config_to_use="$BEDROCK_GEYSER_PLUGIN_CONFIG"
  resolved_geyser_libpath="${BEDROCK_GEYSER_PLUGIN_LIBPATH:-}"

  if [[ -z "$resolved_geyser_libpath" ]]; then
    resolved_geyser_libpath="$(python3 - <<'PY' "$BEDROCK_GEYSER_PLUGIN_CONFIG"
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text())
except Exception:
    print("")
    raise SystemExit(0)

value = data.get("libpath")
print("" if value is None else str(value))
PY
)"
  fi

  if [[ -z "$resolved_geyser_libpath" ]]; then
    echo "Invalid geyser config: missing libpath in $BEDROCK_GEYSER_PLUGIN_CONFIG"
    exit 1
  fi

  if [[ ! -f "$resolved_geyser_libpath" ]]; then
    cat <<EOF
Missing Yellowstone plugin library:
  $resolved_geyser_libpath

Fix one of these:
  1) Build plugin:
     cargo build --release
  2) Set BEDROCK_GEYSER_PLUGIN_LIBPATH to the built dylib/so path.
  3) Update libpath in:
     $BEDROCK_GEYSER_PLUGIN_CONFIG
EOF
    exit 1
  fi

  if [[ -n "${BEDROCK_GEYSER_PLUGIN_LIBPATH:-}" ]]; then
    generated_geyser_config="${BEDROCK_LEDGER_DIR}/yellowstone-config.runtime.json"
    python3 - <<'PY' "$BEDROCK_GEYSER_PLUGIN_CONFIG" "$generated_geyser_config" "$resolved_geyser_libpath"
import json
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
libpath = sys.argv[3]

data = json.loads(src.read_text())
data["libpath"] = libpath
dst.write_text(json.dumps(data, indent=2) + "\n")
PY
    geyser_config_to_use="$generated_geyser_config"
  fi

  args+=(--geyser-plugin-config "$geyser_config_to_use")
fi

exec agave-validator "${args[@]}"
