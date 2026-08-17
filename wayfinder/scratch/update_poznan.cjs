const fs = require('fs');

const originalFilePath = 'E:/TechTrekGT/wayfinder/src/data/poland-2026.js';
const newPoznanPath = 'E:/TechTrekGT/wayfinder/scratch/poznan-updated.txt';

const content = fs.readFileSync(originalFilePath, 'utf8');
const newPoznan = fs.readFileSync(newPoznanPath, 'utf8');

// Find the start of the Poznan object by regex
const match = content.match(/{\s*id:\s*["']poznan["']/);
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
    
    const newContent = before + newPoznan + after;
    fs.writeFileSync(originalFilePath, newContent);
    console.log("Successfully replaced the Poznan object.");
} else {
    console.log("Could not find id: 'poznan'");
}
