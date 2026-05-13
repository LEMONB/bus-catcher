FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

RUN apk del python3 make g++

COPY . .
RUN npm run build
RUN npx tsc --project tsconfig.server.build.json --outDir ./dist/server
COPY index.html ./dist/

FROM node:20-alpine AS backend
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/server ./dist/server

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/server/index.js"]

FROM nginx:alpine AS frontend
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
