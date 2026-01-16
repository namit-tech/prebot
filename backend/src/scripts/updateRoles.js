require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/database');

// Connect to database
connectDB();

async function updateRoles() {
  try {
    // Wait for connection
    await mongoose.connection.once('open', async () => {
      console.log('✅ Connected to MongoDB');
      
      // 1. Change all 'admin' roles to 'client'
      console.log('\n📝 Updating admin roles to client...');
      const updateResult = await User.updateMany(
        { role: 'admin' },
        { $set: { role: 'client' } }
      );
      console.log(`✅ Updated ${updateResult.modifiedCount} user(s) from 'admin' to 'client'`);
      
      // 2. Show summary
      const roleCounts = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);
      
      console.log('\n📊 Current role distribution:');
      roleCounts.forEach(role => {
        console.log(`   ${role._id || 'null'}: ${role.count} user(s)`);
      });
      
      await mongoose.connection.close();
      console.log('\n✅ Role update complete!');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
updateRoles();






