FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run typecheck:server

FROM node:20-alpine AS backend
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY tsconfig.server.json ./

RUN npx tsc --project tsconfig.server.json --outDir ./dist/server

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/server/index.js"]

FROM nginx:alpine AS frontend
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
