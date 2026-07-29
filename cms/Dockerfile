FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/src src
COPY --from=build /app/drizzle drizzle
COPY --from=build /app/dist/ui dist/ui
USER node
EXPOSE 8080
# The server is TypeScript run by Node's type stripping, so there is no compile step and no need for npm at runtime.
CMD ["node", "src/server/main.ts"]
