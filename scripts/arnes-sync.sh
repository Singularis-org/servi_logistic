#!/usr/bin/env bash
# arnes-sync.sh — envoltorio de scripts/arnes-sync.mjs (la logica vive en Node para que funcione
# igual en Windows y en Linux). Uso: ./scripts/arnes-sync.sh --help
exec node "$(dirname "$0")/arnes-sync.mjs" "$@"
