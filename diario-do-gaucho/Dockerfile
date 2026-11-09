# Imagem de produção (Render, Railway, Fly.io, VPS…)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN useradd --system --uid 1001 app
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/package.json ./package.json
COPY --from=build --chown=app /app/next.config.ts ./next.config.ts
COPY --from=build --chown=app /app/supabase ./supabase
COPY --from=build --chown=app /app/assets ./assets
COPY --from=build --chown=app /app/public ./public
USER app
EXPOSE 3000
CMD ["npm", "start"]
