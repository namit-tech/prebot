const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed

const checkUser = async () => {
    try {
        // Connect directly to Mongo (use string from .env or hardcode for debug if needed, trying standard local first if .env fails)
        const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/prebot_db'; 
        console.log(`Connecting to ${mongoURI}...`);
        await mongoose.connect(mongoURI);

        const email = 'jamit773@gmail.com';
        console.log(`\n🔍 Looking up user: ${email}`);

        const user = await User.findOne({ email }).populate('subscription');
        
        if (!user) {
            console.log('❌ User not found!');
        } else {
            console.log('✅ User Found:');
            console.log(`   ID: ${user._id}`);
            console.log(`   Role: ${user.role}`);
            
            if (user.subscription) {
                console.log('\n📦 Subscription Details:');
                console.log(`   ID: ${user.subscription._id}`);
                console.log(`   Models: ${JSON.stringify(user.subscription.models)}`);
                console.log(`   👉 AI Model Preference: ${user.subscription.aiModel} 👈 (Should be 'gemma2:2b')`);
            } else {
                console.log('❌ No Subscription linked!');
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDone.');
    }
};

checkUser();
