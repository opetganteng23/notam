# NOTAM AI (backend NestJS + frontend hasil build, satu proses). Dibangun dari akar repo:
#   docker build -f deploy/docker/Dockerfile -t notam-ai:latest .
# Frontend (public/) dibuild di luar Docker (npm run build:web di PC): CPU server tujuan tidak mendukung
# instruksi yang dibutuhkan vite ("Illegal instruction"). public/ harus ada di akar repo saat build.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
COPY data ./data
USER node
EXPOSE 3300
CMD ["node", "dist/main.js"]
