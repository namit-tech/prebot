const fs = require('fs');
const path = require('path');

// Initialize bytenode
require('bytenode');

const jscPath = path.join(__dirname, 'main.jsc');

if (fs.existsSync(jscPath)) {
    // Production: Load the compiled V8 bytecode
    require(jscPath);
} else {
    // Development: Fallback to the original source code
    require('./main.js');
}