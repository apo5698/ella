# syntax=docker/dockerfile:1

FROM oven/bun:1-debian AS bun

FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS baidupcs
ARG TARGETOS
ARG TARGETARCH
# Pin the upstream source inspected for the share transfer/download contract.
ARG BAIDUPCS_VERSION=1b9131817aaf8ca7dee24bc00e33ebc4c7a5cc73
RUN go mod download -json github.com/qjfoidnh/BaiduPCS-Go@${BAIDUPCS_VERSION} > /tmp/module.json \
    && module_dir="$(sed -n 's/.*"Dir": "\([^" ]*\)".*/\1/p' /tmp/module.json)" \
    && cd "$module_dir" \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -o /out/BaiduPCS-Go .

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS builder
WORKDIR /app

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN bun run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=baidupcs /out/BaiduPCS-Go /usr/local/bin/BaiduPCS-Go

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p data public/thumbs \
    && chown -R nextjs:nodejs data public/thumbs

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
