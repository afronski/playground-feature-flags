FROM alpine:3.21

RUN apk add --no-cache docker-cli ca-certificates curl unzip

WORKDIR /opt/codapi

# Download pre-built codapi binary
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      amd64) ARCH="amd64" ;; \
      arm64) ARCH="arm64" ;; \
      *) echo "unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/nalgeon/codapi/releases/download/v0.13.0/codapi_0.13.0_linux_${ARCH}.tar.gz" -o codapi.tar.gz && \
    tar xzf codapi.tar.gz && \
    rm codapi.tar.gz && \
    chmod +x codapi

CMD ["./codapi"]
