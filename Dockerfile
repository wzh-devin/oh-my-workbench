# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS web-build
WORKDIR /src
RUN npm install --global pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=flowly-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY apps/web/ apps/web/
RUN pnpm --filter @workbench/web build

FROM golang:1.26.5-alpine AS api-build
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY apps/api/ ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/flowly-api ./cmd/server \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/asset-renderer ./cmd/asset-renderer

# Office conversion, PDF tools and CJK fonts ship with the application.
FROM gotenberg/gotenberg:8.38.1
LABEL org.opencontainers.image.title="oh-my-workbench" \
      org.opencontainers.image.description="Personal workbench with built-in file previews" \
      org.opencontainers.image.source="https://github.com/wzh-devin/oh-my-workbench" \
      org.opencontainers.image.authors="devin" \
      org.opencontainers.image.version="local" \
      org.opencontainers.image.licenses="MIT"
USER root
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
       nginx libvips-tools ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=api-build /out/flowly-api /out/asset-renderer /usr/local/bin/
COPY --from=web-build /src/apps/web/dist/ /app/web/
COPY LICENSE /usr/share/doc/oh-my-workbench/LICENSE
COPY deploy/docker/nginx.conf /etc/flowly/nginx.conf
COPY --chmod=755 deploy/docker/entrypoint.sh /usr/local/bin/flowly-entrypoint
COPY --chmod=755 deploy/docker/healthcheck.sh /usr/local/bin/flowly-healthcheck
ENV HOME=/tmp/flowly GIN_MODE=release
WORKDIR /app/apps/api
USER gotenberg
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
    CMD ["/usr/local/bin/flowly-healthcheck"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/flowly-entrypoint"]
