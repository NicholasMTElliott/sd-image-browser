FROM node:22 as builder

WORKDIR /app
COPY package.json yarn.lock tsconfig.json .pnp.cjs .pnp.loader.mjs .yarnrc.yml ./
COPY .yarn .yarn
RUN yarn
COPY . .
RUN yarn build

FROM nginx
RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY conf /etc/nginx
COPY --from=builder /app/build/*  /usr/share/nginx/html/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
RUN mkdir -p /etc/nginx/ssl

ENTRYPOINT ["/entrypoint.sh"]
EXPOSE 8080
