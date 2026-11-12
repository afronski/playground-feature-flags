FROM node:20-alpine

RUN apk add --no-cache curl
RUN npm i -g tsx
RUN adduser -D sandbox

ENV NODE_PATH=/usr/local/lib/node_modules
USER sandbox
WORKDIR /sandbox
