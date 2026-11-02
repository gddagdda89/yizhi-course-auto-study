const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, 'src');
const outputFile = path.join(__dirname, 'pc.js');

function build() {
    if (!fs.existsSync(srcDir)) {
        throw new Error(`Source directory not found: ${srcDir}`);
    }

    const headerPath = path.join(srcDir, '01-header.js');
    if (!fs.existsSync(headerPath)) {
        throw new Error(`Header file not found: ${headerPath}`);
    }
    const header = fs.readFileSync(headerPath, 'utf8').trim();

    const bodyFiles = fs.readdirSync(srcDir)
        .filter(f => f.endsWith('.js') && f !== '01-header.js')
        .sort();

    const bodyParts = bodyFiles.map(file => {
        const fullPath = path.join(srcDir, file);
        return fs.readFileSync(fullPath, 'utf8').trim();
    });

    const body = bodyParts.join('\n\n');

    const content = `${header}\n\n(function () {\n    'use strict';\n\n${body}\n\n})();\n`;
    return content;
}

if (require.main === module) {
    const isCheck = process.argv.includes('--check');
    const content = build();

    if (isCheck) {
        if (!fs.existsSync(outputFile)) {
            console.error('Error: pc.js does not exist. Run "npm run build".');
            process.exit(1);
        }
        const existing = fs.readFileSync(outputFile, 'utf8');
        if (existing.replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
            console.error('Error: pc.js is out of date with src/. Run "npm run build" to update.');
            process.exit(1);
        }
        console.log('Build check passed: pc.js matches src/ modules.');
    } else {
        fs.writeFileSync(outputFile, content, 'utf8');
        console.log(`Successfully built ${outputFile} from ${srcDir} (${fs.readdirSync(srcDir).length} modules).`);
    }
}

module.exports = { build };
