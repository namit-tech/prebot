require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/database');

// Connect to database
connectDB();

async function main() {
  try {
    // Wait for MongoDB connection
    if (mongoose.connection.readyState === 0) {
      await new Promise((resolve) => {
        mongoose.connection.once('open', resolve);
      });
    }
    
    console.log('✅ Connected to MongoDB\n');
    
    // 1. Change all 'admin' roles to 'client'
    console.log('📝 Step 1: Updating admin roles to client...');
    const updateResult = await User.updateMany(
      { role: 'admin' },
      { $set: { role: 'client' } }
    );
    console.log(`✅ Updated ${updateResult.modifiedCount} user(s) from 'admin' to 'client'\n`);
    
    // 2. Create superadmin (use command line arguments or defaults)
    const email = process.argv[2] || 'admin@prebot.com';
    const password = process.argv[3] || 'admin123';
    const companyName = process.argv[4] || 'PreBot Admin';
    
    console.log('📝 Step 2: Creating superadmin...');
    console.log(`   Email: ${email}`);
    console.log(`   Company: ${companyName}`);
    
    // Check if superadmin already exists
    let superAdmin = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { role: 'superadmin' }
      ]
    });
    
    if (superAdmin) {
      if (superAdmin.role === 'superadmin') {
        console.log(`\n⚠️  Superadmin already exists: ${superAdmin.email}`);
        console.log('   Skipping creation...\n');
      } else {
        // Update existing user to superadmin
        superAdmin.role = 'superadmin';
        superAdmin.companyName = companyName;
        superAdmin.passwordHash = password; // Will be hashed by pre-save hook
        await superAdmin.save();
        console.log(`\n✅ Updated existing user to superadmin: ${superAdmin.email}\n`);
      }
    } else {
      // Create new superadmin
      superAdmin = new User({
        email: email.toLowerCase().trim(),
        passwordHash: password, // Will be hashed by pre-save hook
        companyName: companyName.trim(),
        role: 'superadmin',
        isActive: true
      });
      
      await superAdmin.save();
      console.log(`\n✅ Superadmin created successfully!\n`);
    }
    
    // 3. Show summary
    const roleCounts = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('📊 Current role distribution:');
    roleCounts.forEach(role => {
      console.log(`   ${role._id || 'null'}: ${role.count} user(s)`);
    });
    
    console.log('\n✅ Script completed successfully!');
    console.log('\n📝 Superadmin credentials:');
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${superAdmin.role}`);
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
main();






