SHELL := /bin/sh
GO_TAGS := dbdrivers

.PHONY: build test vet fmt qa preflight browser-e2e clean migrate
build:
	mkdir -p bin
	CGO_ENABLED=0 go build -tags $(GO_TAGS) -o bin/p2pflow ./cmd/p2pflow
	CGO_ENABLED=0 go build -tags $(GO_TAGS) -o bin/p2pflow-worker ./cmd/p2pflow-worker
	CGO_ENABLED=0 go build -tags $(GO_TAGS) -o bin/p2pflow-migrate ./cmd/p2pflow-migrate
	CGO_ENABLED=0 go build -o bin/p2pflow-updater ./cmd/p2pflow-updater
	CGO_ENABLED=0 go build -o bin/p2pflow-keygen ./cmd/p2pflow-keygen

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -w ./cmd ./internal

qa: fmt test vet
	./scripts/qa.sh

preflight:
	./scripts/production-preflight.sh

browser-e2e:
	node scripts/browser-role-e2e.mjs

migrate:
	go run -tags $(GO_TAGS) ./cmd/p2pflow-migrate

clean:
	rm -rf bin
