FROM node:18-alpine

# Create directory structure: /workspace/shared and /workspace/services/billing-service
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Switch to service directory
WORKDIR /workspace/services/billing-service

# Copy service package.json
COPY services/billing-service/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
RUN npm install

# Copy service source code
COPY services/billing-service/ ./

WORKDIR /workspace/services/billing-service

EXPOSE 3004

CMD ["npm", "start"]

