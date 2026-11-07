# NOTAM AI (backend NestJS + frontend hasil build, satu proses). Dibangun dari akar repo:
#   docker build -f deploy/docker/Dockerfile -t notam-ai:latest .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:all

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
USER node
EXPOSE 3300
CMD ["node", "dist/main.js"]
