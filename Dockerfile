FROM alpine:3.20 AS libs

RUN apk add --no-cache \
    build-base python3 cmake autoconf automake libtool \
    pkgconfig glib-dev x265-dev x265-dev libjpeg-turbo-dev \
    libde265-dev expat-dev glib-dev \
    meson ninja \
    giflib-dev libexif-dev libjpeg-turbo-dev \
    libpng-dev librsvg-dev libtool \
    orc-dev poppler-dev \
    tiff-dev libwebp-dev

ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig:/usr/lib/pkgconfig
ENV LD_LIBRARY_PATH=/usr/local/lib

WORKDIR /usr/src

RUN wget https://github.com/strukturag/libheif/releases/download/v1.19.5/libheif-1.19.5.tar.gz \
    && tar xf libheif* \
    && cd libheif* \
    && mkdir build && cd build \
    && cmake .. \
    -DCMAKE_INSTALL_PREFIX=/usr/local \
    -DCMAKE_INSTALL_LIBDIR=/usr/local/lib \
    -DENABLE_PLUGIN_LOADING=NO \
    && make -j$(nproc) && make install

RUN wget https://github.com/libvips/libvips/releases/download/v8.16.0/vips-8.16.0.tar.xz \
    && tar xf vips* \
    && cd vips* \
    && meson setup build \
    --prefix=/usr/local \
    --libdir=lib \
    -Dmodules=auto \
    -Ddeprecated=false \
    -Dintrospection=disabled \
    -Dorc=disabled \
    -Dhighway=disabled \
    -Dpoppler=disabled \
    -Dpoppler-module=disabled \
    && cd build \
    && meson compile \
    && meson install

FROM node:20-alpine AS base

FROM base AS builder
RUN corepack enable
WORKDIR /app
COPY --link  . .
RUN yarn install --immutable
RUN yarn build

FROM base AS runner
ENV NODE_ENV=development
ENV LD_LIBRARY_PATH=/usr/local/lib
ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=0
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1

RUN apk --update --no-cache add \
    libde265 \
    libsharpyuv \
    x265-libs \
    libjpeg-turbo \
    vips \
    ffmpeg


WORKDIR /usr/local
COPY --from=libs --link /usr/local /patch
RUN cp -r /patch/lib .&& \
cp -r /patch/include .&& \
cp -r /patch/bin .&& \
cp /patch/lib/pkgconfig/*.pc ./lib/pkgconfig/ && \
rm -rf /patch

WORKDIR /app
COPY --from=builder /app/dist .

RUN npm i fluent-ffmpeg sharp
CMD ["node", "index.js"]
