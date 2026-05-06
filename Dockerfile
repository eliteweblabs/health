FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev=false

COPY . .

RUN npm run build && npm prune --omit=dev

EXPOSE 4321

ENV HOST=0.0.0.0
ENV PORT=4321

CMD ["node", "./dist/server/entry.mjs"]
