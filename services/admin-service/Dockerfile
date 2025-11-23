FROM node:18-alpine

# Create directory structure: /workspace/shared and /workspace/services/admin-service
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Copy models needed by admin service
COPY services/listing-service/models/ ./services/listing-service/models/
COPY services/user-service/models/ ./services/user-service/models/

# Switch to service directory
WORKDIR /workspace/services/admin-service

# Copy service package.json
COPY services/admin-service/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
RUN npm install
# Rebuild bcrypt native module for the correct platform
RUN npm rebuild bcrypt --build-from-source || npm install bcrypt --build-from-source

# Copy service source code
COPY services/admin-service/ ./

WORKDIR /workspace/services/admin-service

EXPOSE 3006

CMD ["npm", "start"]

