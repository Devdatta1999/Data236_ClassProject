FROM node:18-alpine

# Create directory structure: /workspace/shared and /workspace/services/provider-service
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Switch to service directory
WORKDIR /workspace/services/provider-service

# Copy service package.json
COPY services/provider-service/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
RUN npm install

# Copy service source code
COPY services/provider-service/ ./

WORKDIR /workspace/services/provider-service

EXPOSE 3005

CMD ["npm", "start"]

