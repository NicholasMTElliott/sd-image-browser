FROM node:18 as builder

WORKDIR /app
COPY . .
RUN yarn
RUN yarn build

FROM nginx
RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY conf /etc/nginx
COPY --from=builder /app/build/*  /usr/share/nginx/html/

EXPOSE 8080
