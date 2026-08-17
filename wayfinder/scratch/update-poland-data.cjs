const fs = require('fs');

const dataPath = 'e:/TechTrekGT/wayfinder/src/data/poland-2026.js';
const remediationPath = 'e:/TechTrekGT/wayfinder/torun-remediation-data.json';

let fileContent = fs.readFileSync(dataPath, 'utf8');
const remediationData = JSON.parse(fs.readFileSync(remediationPath, 'utf8'));

const startStr = '{\n      id: "torun",';
let startIndex = fileContent.indexOf(startStr);
if (startIndex === -1) {
    // try different spacing
    startIndex = fileContent.indexOf('id: "torun"');
    if (startIndex !== -1) {
        startIndex = fileContent.lastIndexOf('{', startIndex);
    }
}
if (startIndex === -1) {
    console.error("Could not find start of torun object");
    process.exit(1);
}

let gdanskIndex = fileContent.indexOf('id: "gdansk"', startIndex);
let endIndex = fileContent.lastIndexOf('}', gdanskIndex);

if (endIndex === -1) {
    console.error("Could not find end of torun object");
    process.exit(1);
}

// Ensure we include the bracket closing the Toruń object correctly, actually we want to replace from startIndex to endIndex (exclusive) or so.
// Wait, if endIndex is the } before id: gdansk, then it's the } of the Torun object. So we want to replace from startIndex to endIndex + 1.
// Let's refine endIndex to include the '}' 
endIndex = endIndex + 1;

const replacementContent = JSON.stringify(remediationData, null, 6)
  .replace(/\n/g, '\n    ')
  .replace(/"([^"]+)":/g, '$1:');

const newContent = fileContent.substring(0, startIndex) + replacementContent + fileContent.substring(endIndex);

fs.writeFileSync(dataPath, newContent, 'utf8');
console.log("Successfully replaced Torun object in poland-2026.js");
