const fs = require('fs');

const originalFilePath = 'E:/TechTrekGT/wayfinder/src/data/poland-2026.js';
const newGdanskPath = 'E:/TechTrekGT/wayfinder/scratch/gdansk-updated.txt';

const content = fs.readFileSync(originalFilePath, 'utf8');
const newGdansk = fs.readFileSync(newGdanskPath, 'utf8');

// Find the start of the Gdansk object by regex
const match = content.match(/{\s*id:\s*["']gdansk["']/);
if (match) {
    const startIndex = match.index;
    let braceCount = 0;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
    
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex);
    
    const newContent = before + newGdansk + after;
    fs.writeFileSync(originalFilePath, newContent);
    console.log("Successfully replaced the Gdansk object.");
} else {
    console.log("Could not find id: 'gdansk'");
}
