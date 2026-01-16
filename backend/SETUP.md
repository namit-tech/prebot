# Backend Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Create .env File
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Or create `.env` manually with:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/prebot_db
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-characters
ENCRYPTION_KEY=your-64-character-hex-encryption-key-generate-with-openssl-rand-hex-32
ENCRYPTION_IV=your-32-character-hex-iv-generate-with-openssl-rand-hex-16
FRONTEND_URL=http://localhost:3000
```

### 3. Generate Encryption Keys
```bash
# Generate ENCRYPTION_KEY (64 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ENCRYPTION_IV (32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Or on Linux/Mac:
```bash
openssl rand -hex 32  # For ENCRYPTION_KEY
openssl rand -hex 16  # For ENCRYPTION_IV
```

### 4. Start MongoDB
**Windows:**
```bash
# If MongoDB is installed as a service, it should start automatically
# Or start manually:
"C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"
```

**Linux/Mac:**
```bash
sudo systemctl start mongod
# or
mongod
```

### 5. Initialize Database
```bash
npm run init:modules
```

### 6. Start Server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Troubleshooting

### MongoDB Connection Error
If you see `MONGODB_URI is not defined`:
1. Make sure `.env` file exists in the `backend` directory
2. Check that `MONGODB_URI` is set in `.env`
3. Verify MongoDB is running: `mongosh` or `mongo`

### Duplicate Index Warnings
These warnings are now fixed. If you still see them:
1. Drop the database and recreate: `mongosh prebot_db --eval "db.dropDatabase()"`
2. Restart the server

### Port Already in Use
If port 5000 is already in use:
1. Change `PORT` in `.env` file
2. Or kill the process using port 5000:
   ```bash
   # Windows
   netstat -ano | findstr :5000
   taskkill /PID <PID> /F
   
   # Linux/Mac
   lsof -ti:5000 | xargs kill
   ```






