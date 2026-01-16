require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/database');

// Connect to database
connectDB();

async function createSuperAdmin() {
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
      
      // 2. Check if superadmin already exists
      const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
      
      if (existingSuperAdmin) {
        console.log('\n⚠️  Superadmin already exists:');
        console.log(`   Email: ${existingSuperAdmin.email}`);
        console.log(`   Company: ${existingSuperAdmin.companyName}`);
        console.log(`   Role: ${existingSuperAdmin.role}`);
        
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        readline.question('\n❓ Do you want to create a new superadmin? (y/n): ', async (answer) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            await createNewSuperAdmin();
          } else {
            console.log('\n✅ Keeping existing superadmin');
          }
          readline.close();
          await mongoose.connection.close();
          process.exit(0);
        });
      } else {
        await createNewSuperAdmin();
        await mongoose.connection.close();
        process.exit(0);
      }
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function createNewSuperAdmin() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    readline.question('\n📧 Enter superadmin email: ', async (email) => {
      readline.question('🔒 Enter password (min 6 characters): ', async (password) => {
        readline.question('🏢 Enter company name: ', async (companyName) => {
          readline.close();
          
          try {
            // Check if email already exists
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
              console.log(`\n❌ User with email ${email} already exists!`);
              console.log('   Updating existing user to superadmin...');
              
              existingUser.role = 'superadmin';
              existingUser.companyName = companyName || existingUser.companyName;
              if (password && password.length >= 6) {
                existingUser.passwordHash = password; // Will be hashed by pre-save hook
              }
              await existingUser.save();
              
              console.log(`\n✅ Updated user to superadmin:`);
              console.log(`   Email: ${existingUser.email}`);
              console.log(`   Company: ${existingUser.companyName}`);
              console.log(`   Role: ${existingUser.role}`);
            } else {
              // Create new superadmin
              const superAdmin = new User({
                email: email.toLowerCase().trim(),
                passwordHash: password, // Will be hashed by pre-save hook
                companyName: companyName.trim(),
                role: 'superadmin',
                isActive: true
              });
              
              await superAdmin.save();
              
              console.log(`\n✅ Superadmin created successfully!`);
              console.log(`   Email: ${superAdmin.email}`);
              console.log(`   Company: ${superAdmin.companyName}`);
              console.log(`   Role: ${superAdmin.role}`);
            }
            
            resolve();
          } catch (error) {
            console.error('\n❌ Error creating superadmin:', error.message);
            resolve();
          }
        });
      });
    });
  });
}

// Run the script
createSuperAdmin();






