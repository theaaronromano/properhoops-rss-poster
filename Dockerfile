FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy app
COPY index.js ./

# Create data directory for seen.json persistence
RUN mkdir -p /data
ENV SEEN_FILE=/data/seen.json

CMD ["node", "index.js"]
