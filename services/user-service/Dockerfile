FROM node:18-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Create directory structure: /workspace/shared and /workspace/services/user-service
WORKDIR /workspace

# Copy and install shared package
COPY shared/ ./shared/
WORKDIR /workspace/shared
RUN npm install

# Switch to service directory
WORKDIR /workspace/services/user-service

# Copy service package.json
COPY services/user-service/package*.json ./
# Install service dependencies (shared is at ../../shared from here)
# This will install bcrypt and mongoose directly in service node_modules
RUN npm install

# Copy service source code
COPY services/user-service/ ./

# Remove bcrypt completely and reinstall to ensure it's built for Alpine Linux
# This must be done AFTER copying source code to avoid any symlink issues
RUN rm -rf node_modules/bcrypt && \
    npm cache clean --force && \
    npm install bcrypt@^5.1.1 --build-from-source

WORKDIR /workspace/services/user-service

EXPOSE 3001

CMD ["npm", "start"]

