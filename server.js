const DesktopServer = require('./desktop-server');
const os = require('os');

console.log('🤖 Offline AI Assistant - Server Mode');
console.log('=====================================');
console.log('');

// Initialize server
try {
    const server = new DesktopServer();
    
    // Show network information
    const networkInterfaces = os.networkInterfaces();
    console.log('\n🌐 Network Information:');
    console.log('================================');
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
        const interfaces = networkInterfaces[interfaceName];
        interfaces.forEach(netInterface => {
            if (netInterface.family === 'IPv4' && !netInterface.internal) {
                console.log(`📱 Mobile URL: http://${netInterface.address}:${server.port}/mobile`);
            }
        });
    });
    
    console.log('================================\n');
    console.log('✅ Server is running!');
    console.log('ℹ️  Keep this window open');
    console.log('ℹ️  Press Ctrl+C to stop');
    console.log('');
    
} catch (error) {
    console.error('❌ Error starting server:', error.message);
    console.error('');
    console.error('Please check:');
    console.error('1. Node.js is installed');
    console.error('2. Dependencies are installed (run: npm install)');
    console.error('3. Port is not in use');
    console.error('');
    
    process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});

