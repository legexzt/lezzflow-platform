FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure uploads directory exists
RUN mkdir -p uploads

EXPOSE 3000

# PID 1 = node directly so Docker SIGTERM reaches the app's graceful-shutdown handler
# (npm as PID 1 does not forward signals, causing SIGKILL on every stop/restart).
CMD ["node", "server.js"]
