# Sourcly on Railway (or anywhere that runs containers): build the site, then serve the finished
# files with nginx. Nothing in the container runs Sourcly's own code; the app works in the browser.
#
#   docker build -t sourcly .
#   docker run --rm -p 8080:8080 sourcly        # then open http://localhost:8080

FROM node:24-alpine AS build
WORKDIR /app
# The pnpm version comes from "packageManager" in package.json.
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @sourcly/web build && node scripts/check-dist.mjs

FROM nginx:stable-alpine
# nginx fills in ${PORT} from the environment when the container starts. Railway sets PORT.
ENV PORT=8080
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
