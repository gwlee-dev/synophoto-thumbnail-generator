FROM node:20-bookworm-slim AS base
RUN apt-get update

FROM base AS builder
RUN corepack enable
WORKDIR /app
COPY --link  . .
RUN yarn install --immutable
RUN yarn build

FROM base AS runner
RUN apt-get install -y ffmpeg
WORKDIR /app
COPY --from=builder /app/dist .
RUN npm i fluent-ffmpeg sharp
CMD ["node", "index.js"]
