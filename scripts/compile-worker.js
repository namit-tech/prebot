const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

const v8 = require('v8');

// Crucial for Bytenode: Disable lazy compilation to capture the full function bodies
v8.setFlagsFromString('--no-lazy');

// This script is meant to be run by ELECTRON, not NODE.
const fileToCompile = process.argv[2];

if (!fileToCompile) {
    console.error('No file provided to worker');
    process.exit(1);
}

async function run() {
    try {
        await bytenode.compileFile(fileToCompile, fileToCompile + 'c');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
