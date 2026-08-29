FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -tags dbdrivers -trimpath -ldflags="-s -w" -o /out/p2pflow ./cmd/p2pflow \
 && CGO_ENABLED=0 go build -tags dbdrivers -trimpath -ldflags="-s -w" -o /out/p2pflow-worker ./cmd/p2pflow-worker \
 && CGO_ENABLED=0 go build -tags dbdrivers -trimpath -ldflags="-s -w" -o /out/p2pflow-migrate ./cmd/p2pflow-migrate

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /app --shell /usr/sbin/nologin p2pflow
WORKDIR /app
COPY --from=build /out/p2pflow /app/p2pflow
COPY --from=build /out/p2pflow-worker /app/p2pflow-worker
COPY --from=build /out/p2pflow-migrate /app/p2pflow-migrate
COPY web /app/web
COPY migrations /app/migrations
RUN mkdir -p /app/data/uploads && chown -R p2pflow:p2pflow /app
USER p2pflow
ENV P2PFLOW_PUBLIC_DIR=/app/web P2PFLOW_MIGRATION_DIR=/app/migrations P2PFLOW_UPLOAD_DIR=/app/data/uploads P2PFLOW_LISTEN=:8080
EXPOSE 8080
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD curl -fsS http://127.0.0.1:8080/ready || exit 1
ENTRYPOINT ["/app/p2pflow"]
