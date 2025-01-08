FROM node:18 as builder

WORKDIR /app
COPY . .
RUN yarn
RUN yarn build

FROM nginx
RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY conf /etc/nginx
COPY --from=builder /app/build/*  /usr/share/nginx/html/
RUN mkdir -p /etc/nginx/ssl
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/self-signed.key -out /etc/nginx/ssl/self-signed.crt -subj "/C=US/ST=YourState/L=YourCity/O=YourOrganization/OU=YourUnit/CN=192.168.1.11"

EXPOSE 8080
