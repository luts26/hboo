FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-ukr

COPY package*.json ./

RUN npm ci

COPY src ./src
COPY scripts ./scripts

EXPOSE 3000

CMD ["node", "src/server.js"]
