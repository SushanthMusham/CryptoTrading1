# Use the official lightweight Node environment
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Expose Vite's default port
EXPOSE 5173

# Run Vite in host mode so Docker can broadcast it
CMD ["npm", "run", "dev", "--", "--host"]