const fs = require('fs');
const content = fs.readFileSync('E:/TechTrekGT/wayfinder/src/data/poland-2026.js', 'utf8');

// Find the start of the Poznan object by regex (assuming it starts with id: "poznan")
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
    
    const poznanText = content.substring(startIndex, endIndex);
    fs.writeFileSync('E:/TechTrekGT/wayfinder/scratch/poznan-current.txt', poznanText);
    console.log("Extracted poznan object, length:", poznanText.length);
} else {
    console.log("Could not find id: 'poznan'");
}
