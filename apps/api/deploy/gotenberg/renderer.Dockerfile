FROM gotenberg/gotenberg:8.38.1 AS fonts

FROM --platform=$BUILDPLATFORM golang:1.26.5-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/asset-renderer/ cmd/asset-renderer/
COPY internal/platform/logging/ internal/platform/logging/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /asset-renderer ./cmd/asset-renderer

FROM debian:bookworm-slim
RUN apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends libvips-tools libpoppler-glib8 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /asset-renderer /usr/local/bin/asset-renderer
COPY --from=fonts /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc /usr/share/fonts/opentype/noto/
COPY --from=fonts /usr/share/doc/fonts-noto-cjk/copyright /usr/share/doc/fonts-noto-cjk/copyright
RUN fc-cache -f && install -d -o 65534 -g 65534 -m 0750 /app/logs
WORKDIR /app
VOLUME ["/app/logs"]
USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/asset-renderer"]
