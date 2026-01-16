#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists!');
  console.log('   If you want to recreate it, delete the existing file first.');
  process.exit(0);
}

// Generate encryption keys
const encryptionKey = crypto.randomBytes(32).toString('hex');
const encryptionIV = crypto.randomBytes(16).toString('hex');
const jwtSecret = crypto.randomBytes(32).toString('hex');

// Default .env content
const envContent = `# Server Configuration
NODE_ENV=development
PORT=5000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/prebot_db

# JWT Configuration
JWT_SECRET=${jwtSecret}

# Encryption Keys (auto-generated)
ENCRYPTION_KEY=${encryptionKey}
ENCRYPTION_IV=${encryptionIV}

# Frontend URL
FRONTEND_URL=http://localhost:3000
`;

// Write .env file
fs.writeFileSync(envPath, envContent);

console.log('✅ .env file created successfully!');
console.log('');
console.log('📝 Generated values:');
console.log(`   JWT_SECRET: ${jwtSecret.substring(0, 20)}...`);
console.log(`   ENCRYPTION_KEY: ${encryptionKey.substring(0, 20)}...`);
console.log(`   ENCRYPTION_IV: ${encryptionIV.substring(0, 20)}...`);
console.log('');
console.log('⚠️  Make sure MongoDB is running before starting the server!');
console.log('   Start MongoDB: mongod (or use MongoDB service)');






