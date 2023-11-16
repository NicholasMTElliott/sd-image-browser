FROM node:18-alpine as build-core
RUN apk update
RUN apk add zsh file gnupg cryptsetup curl make sudo e2fsprogs
RUN curl https://files.dyne.org/tomb/Tomb-2.10.tar.gz --output Tomb-2.10.tar.gz
RUN tar xvzf Tomb-2.10.tar.gz
RUN cd Tomb-2.10 && make install
RUN tomb -h

RUN apk add imagemagick yarn
RUN magick --version

FROM build-core as build-api
WORKDIR /app

COPY .pnp* ./
COPY .yarn ./.yarn
COPY .yarnrc.yml ./
COPY tsconfig.json ./
COPY yarn.lock ./
COPY package.json ./

RUN yarn 

COPY ./src ./src
RUN yarn build
RUN npm prune --production


EXPOSE 3333
ENV PORT=3333
ENV NODE_ENV="production"


CMD ["node", "./dist/index.js"]
