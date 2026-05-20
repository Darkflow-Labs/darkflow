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

if [[ -z "${BEDROCK_LEDGER_DIR:-}" ]]; then
  echo "Missing required env var: BEDROCK_LEDGER_DIR"
  exit 1
fi

REMOTE_DIR="${BEDROCK_LEDGER_DIR}/remote"
KEEP_FULL="${BEDROCK_KEEP_FULL_SNAPSHOTS:-2}"
KEEP_INCREMENTAL="${BEDROCK_KEEP_INCREMENTAL_SNAPSHOTS:-4}"
LOG_MAX_MB="${BEDROCK_LOG_MAX_MB:-1024}"

if [[ ! -d "$REMOTE_DIR" ]]; then
  echo "Remote snapshot directory not found, skipping: $REMOTE_DIR"
else
  prune_matching_files() {
    local keep_count="$1"
    shift
    local paths=("$@")
    local total="${#paths[@]}"

    if (( total <= keep_count )); then
      return 0
    fi

    local idx
    for (( idx=keep_count; idx<total; idx++ )); do
      local file_path="${paths[$idx]}"
      if [[ -f "$file_path" ]]; then
        rm -f "$file_path"
        echo "Pruned old snapshot archive: $file_path"
      fi
    done
  }

  shopt -s nullglob
  mapfile -t full_archives < <(ls -1t "$REMOTE_DIR"/snapshot-*.tar.* 2>/dev/null || true)
  mapfile -t incremental_archives < <(ls -1t "$REMOTE_DIR"/incremental-snapshot-*.tar.* 2>/dev/null || true)
  shopt -u nullglob

  prune_matching_files "$KEEP_FULL" "${full_archives[@]}"
  prune_matching_files "$KEEP_INCREMENTAL" "${incremental_archives[@]}"
fi

if [[ -n "${BEDROCK_LOG_PATH:-}" && -f "${BEDROCK_LOG_PATH}" ]]; then
  # Rotate logs with copy-truncate semantics to avoid restarting agave.
  log_size_bytes="$(wc -c < "$BEDROCK_LOG_PATH" | tr -d ' ')"
  max_log_bytes="$((LOG_MAX_MB * 1024 * 1024))"

  if (( log_size_bytes > max_log_bytes )); then
    ts="$(date +"%Y%m%d-%H%M%S")"
    rotated_path="${BEDROCK_LOG_PATH}.${ts}"
    cp "$BEDROCK_LOG_PATH" "$rotated_path"
    : > "$BEDROCK_LOG_PATH"
    gzip -f "$rotated_path"
    echo "Rotated bedrock log: ${rotated_path}.gz"
  fi
fi

echo "Bedrock storage cleanup complete."
