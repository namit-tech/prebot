#!/bin/bash
echo "========================================"
echo "   Offline AI Assistant Setup"
echo "========================================"
echo

echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Download the LTS version and install it."
    echo
    exit 1
fi

echo "Node.js found:"
node --version
echo

echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies!"
    echo "Please check your internet connection."
    echo
    exit 1
fi

echo
echo "========================================"
echo "   Setup Complete!"
echo "========================================"
echo
echo "Choose your preferred method:"
echo
echo "1. Desktop App (Recommended)"
echo "   - Run: npm start"
echo "   - Native desktop application"
echo "   - Works completely offline"
echo
echo "2. Web Server (For Mobile Access)"
echo "   - Run: python -m http.server 8000 --bind 0.0.0.0"
echo "   - Access from mobile: http://YOUR_IP:8000"
echo
echo "3. Build Executable"
echo "   - Run: npm run build-win    (Windows)"
echo "   - Run: npm run build-mac    (macOS)"
echo "   - Run: npm run build-linux  (Linux)"
echo
echo "Getting your IP address..."
if command -v ip &> /dev/null; then
    ip addr show | grep "inet " | grep -v 127.0.0.1
elif command -v ifconfig &> /dev/null; then
    ifconfig | grep "inet " | grep -v 127.0.0.1
fi
echo
echo "Use this IP address to access from mobile devices."
echo
