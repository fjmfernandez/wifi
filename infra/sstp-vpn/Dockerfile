FROM debian:bookworm-slim AS builder

ARG ACCEL_PPP_VERSION=1.14.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      git \
      libpcre2-dev \
      libssl-dev \
      make \
    && git clone --depth 1 --branch "${ACCEL_PPP_VERSION}" https://github.com/accel-ppp/accel-ppp.git /src/accel-ppp \
    && cmake -S /src/accel-ppp -B /src/accel-ppp/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/usr \
      -DBUILD_IPOE_DRIVER=FALSE \
      -DBUILD_VLAN_MON_DRIVER=FALSE \
      -DCRYPTO=OPENSSL \
    && cmake --build /src/accel-ppp/build --parallel \
    && DESTDIR=/opt/rootfs cmake --install /src/accel-ppp/build

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      iproute2 \
      iptables \
      libpcre2-8-0 \
      libssl3 \
      openssl \
      procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/rootfs /
COPY bin/entrypoint.sh /usr/local/bin/entelsat-sstp-entrypoint

RUN chmod 0755 /usr/local/bin/entelsat-sstp-entrypoint \
    && install -d -m 0750 /run/entelsat-sstp /var/log/accel-ppp

EXPOSE 4443/tcp

HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
  CMD pgrep -x accel-pppd >/dev/null

ENTRYPOINT ["/usr/local/bin/entelsat-sstp-entrypoint"]
