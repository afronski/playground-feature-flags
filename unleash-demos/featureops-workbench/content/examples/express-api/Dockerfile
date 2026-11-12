FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY nodemon.json ./
COPY src/ src/

# Stash defaults for volume bootstrap (G-007)
RUN cp -r src/fragments src/fragments-defaults

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npx", "nodemon"]
