FROM node:20-alpine

RUN npm i -g tsx unleash-client ws
RUN adduser -D sandbox

ENV NODE_PATH=/usr/local/lib/node_modules
USER sandbox
WORKDIR /sandbox
