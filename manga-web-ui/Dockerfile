# Stage 1: Build the React / Vite application
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency definition files
COPY package*.json ./

# Install packages
RUN npm ci

# Copy the rest of the source code
COPY . .

# Accept VITE_API_URL as a build-time argument
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build the Vite static assets
RUN npm run build

# Stage 2: Serve the static files using Nginx
FROM nginx:alpine

# Inject a custom Nginx server block to support HTML5 Push State routing (React Router) and proxy backend requests
RUN printf '%s\n' \
    'server {' \
    '    listen 80;' \
    '    server_name localhost;' \
    '    location / {' \
    '        root /usr/share/nginx/html;' \
    '        index index.html index.htm;' \
    '        try_files $uri $uri/ /index.html;' \
    '    }' \
    '    location /api/ {' \
    '        proxy_pass http://backend:8000/api/;' \
    '        proxy_set_header Host $host;' \
    '        proxy_set_header X-Real-IP $remote_addr;' \
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
    '        proxy_set_header X-Forwarded-Proto $scheme;' \
    '        client_max_body_size 50M;' \
    '    }' \
    '    location /workspace/ {' \
    '        proxy_pass http://backend:8000/workspace/;' \
    '        proxy_set_header Host $host;' \
    '        proxy_set_header X-Real-IP $remote_addr;' \
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
    '        proxy_set_header X-Forwarded-Proto $scheme;' \
    '    }' \
    '    error_page 500 502 503 504 /50x.html;' \
    '    location = /50x.html {' \
    '        root /usr/share/nginx/html;' \
    '    }' \
    '}' > /etc/nginx/conf.d/default.conf

# Copy built assets from build stage to Nginx directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose web port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
