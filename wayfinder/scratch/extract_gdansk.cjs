const fs = require('fs');

const fileContent = fs.readFileSync('src/data/poland-2026.js', 'utf8');

// Find the start of the gdansk object
const match = fileContent.match(/{\s*id:\s*["']gdansk["']/);
if (match) {
    const startIndex = match.index;
    let braceCount = 0;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < fileContent.length; i++) {
        if (fileContent[i] === '{') braceCount++;
        else if (fileContent[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
    
    const gdanskObj = fileContent.substring(startIndex, endIndex);
    fs.writeFileSync('scratch/gdansk-current.txt', gdanskObj);
    console.log('Successfully extracted Gdansk object to scratch/gdansk-current.txt');
} else {
    console.log('Could not find id: "gdansk"');
}
