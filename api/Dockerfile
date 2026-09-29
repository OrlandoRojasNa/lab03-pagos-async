# Contexto de construcción: raíz del repositorio (ver docker-compose.yml)
FROM node:22-alpine

ENV NODE_ENV=production TZ=America/Bogota
RUN apk add --no-cache tzdata
WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY comun ./comun
COPY api/src ./src

USER node
CMD ["node", "src/index.js"]
