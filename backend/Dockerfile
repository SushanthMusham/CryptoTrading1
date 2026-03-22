# Use the official lightweight Node environment
FROM node:20-alpine

# Install OpenSSL (Strictly required by Prisma on Alpine Linux)
RUN apk add --no-cache openssl

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate the client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the backend code
COPY . .

# Push the database schema to ensure SQLite is ready
RUN npx prisma db push

# Expose the backend port
EXPOSE 3000

# Start the backend server
CMD ["npx", "ts-node", "src/index.ts"]