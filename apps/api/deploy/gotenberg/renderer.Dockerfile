FROM gotenberg/gotenberg:8.38.1 AS fonts

FROM golang:1.26.5-alpine AS build
WORKDIR /src
COPY cmd/asset-renderer/main.go cmd/asset-renderer/text.go cmd/asset-renderer/video.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /asset-renderer main.go text.go video.go

FROM debian:bookworm-slim
RUN apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends libvips-tools libpoppler-glib8 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /asset-renderer /usr/local/bin/asset-renderer
COPY --from=fonts /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc /usr/share/fonts/opentype/noto/
COPY --from=fonts /usr/share/doc/fonts-noto-cjk/copyright /usr/share/doc/fonts-noto-cjk/copyright
RUN fc-cache -f
USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/asset-renderer"]
