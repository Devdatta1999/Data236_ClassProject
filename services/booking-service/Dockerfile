FROM node:18-alpine

# Create directory structure: /workspace/shared and /workspace/services/booking-service
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Switch to service directory
WORKDIR /workspace/services/booking-service

# Copy service package.json
COPY services/booking-service/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
RUN npm install

# Copy service source code
COPY services/booking-service/ ./

WORKDIR /workspace/services/booking-service

EXPOSE 3003

CMD ["npm", "start"]

