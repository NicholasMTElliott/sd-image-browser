FROM node:18-alpine as build-api

WORKDIR /app

COPY . .

RUN yarn 
RUN yarn build

EXPOSE 3333
ENV PORT=3333
ENV NODE_ENV="production"

CMD ["node", "./dist/index.js"]
