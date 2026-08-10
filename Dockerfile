FROM node:22-bookworm-slim AS build

WORKDIR /usr/src/app

# Install dependencies first for better layer caching.
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

# Copy the application source and build it.
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=8080

# Install only production dependencies in the runtime image.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# Copy the compiled app.
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
