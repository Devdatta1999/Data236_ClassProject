FROM node:18-alpine

# Create directory structure: /workspace/shared and /workspace/services/api-gateway
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Switch to service directory
WORKDIR /workspace/services/api-gateway

# Copy service package.json
COPY services/api-gateway/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
RUN npm install

# Copy service source code
COPY services/api-gateway/ ./

WORKDIR /workspace/services/api-gateway

EXPOSE 3000

CMD ["npm", "start"]

