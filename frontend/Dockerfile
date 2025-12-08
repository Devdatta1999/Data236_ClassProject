# Frontend Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies - remove node_modules first to fix rollup issue
RUN rm -rf node_modules package-lock.json && npm install

# Copy source code
COPY . .

# Build arguments for API URLs (will be set at build time)
ARG VITE_API_GATEWAY_URL=http://aerive-api-gateway
ARG VITE_KAFKA_PROXY_URL=http://aerive-kafka-proxy:3007

# Set environment variables for build
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_KAFKA_PROXY_URL=$VITE_KAFKA_PROXY_URL

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Create nginx configuration
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Serve static files \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Proxy API requests to API Gateway \
    location /api { \
        proxy_pass http://aerive-api-gateway:80; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_connect_timeout 60s; \
        proxy_send_timeout 60s; \
        proxy_read_timeout 60s; \
    } \
    \
    # Proxy Kafka proxy requests \
    location /api/kafka { \
        proxy_pass http://aerive-kafka-proxy:3007; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_connect_timeout 60s; \
        proxy_send_timeout 60s; \
        proxy_read_timeout 60s; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
