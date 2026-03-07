# Use an official Node runtime as a parent image
FROM node:18-alpine as build

# working directory
WORKDIR /usr/src/app

# copy dependency definitions
COPY package*.json ./

# install dependencies
RUN npm ci --only=production

# copy the rest of the application
COPY . .

# production environment
ENV NODE_ENV=production

# expose the port that Cloud Run or other platforms expect
# Cloud Run provides a PORT environment variable but default 8080 is common
EXPOSE 8080

# start the server
CMD ["node", "src/index.js"]
