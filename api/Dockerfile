# Imagen de la API REST + frontend estático (contexto de build = raíz del repo)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app/api

# 1) Dependencias primero: aprovecha la caché de capas de Docker
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

# 2) Código de la API y frontend
COPY api/src ./src
COPY web /app/web

# No ejecutar como root
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/server.js"]
