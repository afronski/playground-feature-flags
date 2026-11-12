# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /repo

# Copy root workspace config
COPY package.json package-lock.json* ./

# Copy workspace package.json files for dependency resolution
COPY packages/instruments/package.json packages/instruments/
COPY services/workshop-site/package.json services/workshop-site/

RUN npm install

# Copy workspace source
COPY packages/instruments/ packages/instruments/
COPY services/workshop-site/ services/workshop-site/

# Copy chapter content into Starlight's content directory
COPY content/chapters/ services/workshop-site/src/content/docs/chapters/

# Build the static site
RUN cd services/workshop-site && npm run build

# Stage 2: Serve static files
FROM nginx:alpine

COPY --from=build /repo/services/workshop-site/dist/ /usr/share/nginx/html/

RUN rm -f /etc/nginx/conf.d/default.conf
COPY services/workshop-site/nginx.conf /etc/nginx/conf.d/workshop.conf

EXPOSE 3000
