FROM node:22-alpine
WORKDIR /app

# Nur Manifeste zuerst -> Cache-freundlich
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8081
EXPOSE 8081

# Datenablage (per Volume gemountet)
ENV DATA_DIR=/data

CMD ["node", "server.js"]
