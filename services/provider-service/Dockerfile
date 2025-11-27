FROM node:18-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

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

# Remove bcrypt completely and reinstall to ensure it's built for Alpine Linux
# This must be done AFTER copying source code to avoid any symlink issues
RUN rm -rf node_modules/bcrypt && \
    npm cache clean --force && \
    npm install bcrypt@^5.1.1 --build-from-source

WORKDIR /workspace/services/provider-service

# Create uploads directory for profile pictures
RUN mkdir -p uploads/profile-pictures

EXPOSE 3005

CMD ["npm", "start"]

