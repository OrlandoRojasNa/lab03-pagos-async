# Contexto de construcción: raíz del repositorio (ver docker-compose.yml)
FROM node:22-alpine

ENV NODE_ENV=production TZ=America/Bogota
RUN apk add --no-cache tzdata
WORKDIR /app

COPY consumer/package.json consumer/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY comun ./comun
COPY consumer/src ./src
RUN mkdir -p /app/comprobantes && chown node:node /app/comprobantes

USER node
CMD ["node", "src/index.js"]
