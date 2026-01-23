FROM node:20-alpine

WORKDIR /app

# Prisma needs openssl
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma

RUN npm install

COPY tsconfig.json ./
COPY src ./src

EXPOSE 4000

CMD ["npm", "run", "dev"]
