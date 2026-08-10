FROM node:22-bullseye-slim AS build

WORKDIR /usr/src/app

# Prisma on this project currently resolves a libssl 1.1 engine, so we need
# the matching system library in both build and runtime images.
RUN apt-get update   && apt-get install -y --no-install-recommends openssl   && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching.
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

# Copy the application source and build it.
COPY . .
RUN npm run build

FROM node:22-bullseye-slim AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=8080

RUN apt-get update   && apt-get install -y --no-install-recommends openssl   && rm -rf /var/lib/apt/lists/*

# Install only production dependencies in the runtime image.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# Copy the compiled app.
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
