#!/bin/bash
echo "Installing Offline AI Assistant..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not available!"
    echo "Please check your Node.js installation."
    echo
    exit 1
fi

echo "Node.js version:"
node --version
echo "npm version:"
npm --version
echo

echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies!"
    echo "Please check your internet connection and try again."
    echo
    exit 1
fi

echo
echo "✅ Installation completed successfully!"
echo
echo "To run the app in development mode:"
echo "  npm run dev"
echo
echo "To build the desktop app:"
echo "  npm run build-win    (Windows)"
echo "  npm run build-mac    (macOS)"
echo "  npm run build-linux  (Linux)"
echo
echo "To start the app:"
echo "  npm start"
echo
