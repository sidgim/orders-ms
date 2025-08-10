FROM node:22-alpine3.22

WORKDIR /usr/src/app

COPY package*.json ./
COPY package-lock.json ./

RUN npm install

COPY . . 

EXPOSE 3002
