FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY services/kafka-proxy/package*.json ./

# Install dependencies
RUN npm install --production

# Copy service code
COPY services/kafka-proxy/ ./

# Expose port
EXPOSE 3007

# Start service
CMD ["node", "server.js"]

