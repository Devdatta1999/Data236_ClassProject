FROM node:18-alpine

# Create directory structure: /workspace/shared and /workspace/services/listing-service
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Switch to service directory
WORKDIR /workspace/services/listing-service

# Copy service package.json
COPY services/listing-service/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
RUN npm install

# Copy service source code
COPY services/listing-service/ ./

WORKDIR /workspace/services/listing-service

EXPOSE 3002

CMD ["npm", "start"]

