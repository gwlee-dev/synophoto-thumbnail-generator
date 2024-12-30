FROM node:18-buster AS build
RUN apt-get update && apt-get install -y ffmpeg
RUN corepack enable
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:18-buster AS production
RUN apt-get update && apt-get install -y ffmpeg
WORKDIR /app
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/yarn.lock /app/
RUN yarn install --production
CMD ["node", "dist/index.js"]
