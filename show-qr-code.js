const QRCode = require('qrcode');
const os = require('os');

async function showQRCode() {
    try {
        const networkInterfaces = os.networkInterfaces();
        let localIP = null;

        // Find local IP address
        Object.keys(networkInterfaces).forEach(interfaceName => {
            const interfaces = networkInterfaces[interfaceName];
            interfaces.forEach(netInterface => {
                if (netInterface.family === 'IPv4' && !netInterface.internal) {
                    localIP = netInterface.address;
                }
            });
        });

        if (localIP) {
            const mobileURL = `http://${localIP}:3001/mobile`;
            
            console.log('\n📱 Mobile Access Information:');
            console.log('================================');
            console.log(`🌐 Desktop IP: ${localIP}`);
            console.log(`📱 Mobile URL: ${mobileURL}`);
            console.log('================================');
            
            // Generate QR code
            const qrCodeDataURL = await QRCode.toDataURL(mobileURL);
            console.log('📱 QR Code (scan with your phone):');
            console.log(qrCodeDataURL);
            console.log('================================');
            
            // Create HTML file
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Mobile Access QR Code</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 400px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
        }
        .qr-code {
            margin: 20px 0;
        }
        .url {
            background: #f0f0f0;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            word-break: break-all;
            margin: 20px 0;
        }
        .instructions {
            text-align: left;
            background: #e8f4fd;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .instructions h3 {
            margin-top: 0;
            color: #1976d2;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 Mobile Access</h1>
        <p>Scan this QR code with your phone to access questions:</p>
        
        <div class="qr-code">
            <img src="${qrCodeDataURL}" alt="QR Code" style="max-width: 200px;">
        </div>
        
        <div class="url">
            ${mobileURL}
        </div>
        
        <div class="instructions">
            <h3>📋 Instructions:</h3>
            <ol>
                <li>Make sure your phone is on the same WiFi network</li>
                <li>Scan the QR code above</li>
                <li>Or manually enter the URL in your phone's browser</li>
                <li>Click any question to send it to the desktop</li>
            </ol>
        </div>
    </div>
</body>
</html>`;

            require('fs').writeFileSync('mobile-qr-code.html', html);
            console.log('📄 QR code HTML file created: mobile-qr-code.html');
            console.log('🌐 Open mobile-qr-code.html in your browser to see the QR code');
            console.log('================================\n');
            
        } else {
            console.log('❌ Could not find local IP address');
        }
    } catch (error) {
        console.error('Error generating QR code:', error);
    }
}

showQRCode();
