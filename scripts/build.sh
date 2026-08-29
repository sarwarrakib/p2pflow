#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p bin
CGO_ENABLED=0 go build -tags dbdrivers -trimpath -ldflags="-s -w" -o bin/p2pflow ./cmd/p2pflow
CGO_ENABLED=0 go build -tags dbdrivers -trimpath -ldflags="-s -w" -o bin/p2pflow-worker ./cmd/p2pflow-worker
CGO_ENABLED=0 go build -tags dbdrivers -trimpath -ldflags="-s -w" -o bin/p2pflow-migrate ./cmd/p2pflow-migrate
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/p2pflow-updater ./cmd/p2pflow-updater
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/p2pflow-keygen ./cmd/p2pflow-keygen
printf '%s\n' "Built bin/p2pflow, bin/p2pflow-worker, bin/p2pflow-migrate, bin/p2pflow-updater, bin/p2pflow-keygen"
