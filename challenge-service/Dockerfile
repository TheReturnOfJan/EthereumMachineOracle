# syntax=docker/dockerfile:1
FROM node:12-alpine
RUN apk add --no-cache python g++ make
WORKDIR /challenger-service
COPY . .
RUN npm install --production
# Define password to encrypt keystore.json
ENV PASSWORD=''

CMD ["node", "./runChallenger.js"]
