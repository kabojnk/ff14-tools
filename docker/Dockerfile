# Build stage
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_BUNNY_CDN_URL
ARG VITE_TENOR_API_KEY
ARG VITE_NATIVE_UPDATE_URL

# Skip tsc type-check in Docker — esbuild handles transpilation; type-check runs locally
RUN node_modules/.bin/vite build
# The iOS app's live-update bundle and manifest, served from /native/ (scripts/native-bundle.mjs).
# Never blocks a website deploy: without a new manifest the app just keeps the bundle it has.
RUN (apk add --no-cache zip && node scripts/native-bundle.mjs --publish dist/native) \
    || (rm -rf dist/native && echo "WARNING: iOS bundle not published; the app keeps its current version")

# Production stage
FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
