require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/prebot_db';

async function createSuperAdmin() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        const email = 'elloindia81@gmail.com';
        const password = 'Elloindia81@';
        
        console.log(`🔒 Hashing password with bcryptjs...`);
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        console.log('📝 Upserting superadmin user...');
        
        // Using native collection methods to bypass Mongoose middleware (which uses 'bcrypt' native)
        // just in case we want to be strictly pure 'bcryptjs' for this operation.
        const result = await mongoose.connection.collection('users').updateOne(
            { email: email },
            { 
                $set: { 
                    email: email,
                    passwordHash: hash,
                    role: 'superadmin',
                    companyName: 'Super Admin',
                    isActive: true,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    subscription: null,
                    hardwareId: null,
                }
            },
            { upsert: true }
        );

        if (result.upsertedCount > 0) {
            console.log('✅ Created NEW superadmin user.');
        } else {
            console.log('✅ Updated EXISTING superadmin user.');
        }

        console.log('DETAILS:');
        console.log('Email:', email);
        console.log('Role:', 'superadmin');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
    }
}

createSuperAdmin();
