const fs = require('fs');

const dataPath = 'e:/TechTrekGT/wayfinder/src/data/poland-2026.js';
let fileContent = fs.readFileSync(dataPath, 'utf8');

const startStr = '{\n      id: "torun",';
let startIndex = fileContent.indexOf(startStr);
if (startIndex === -1) {
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
let endIndex = fileContent.lastIndexOf('}', gdanskIndex) + 1;

if (endIndex === -1) {
    console.error("Could not find end of torun object");
    process.exit(1);
}

// Extract the existing Toruń object string
const torunObjStr = fileContent.substring(startIndex, endIndex);

// Parse it to JSON (we have to evaluate it or use a trick because it's JS, not JSON, but wait, the Torun object string I just replaced it with IS JSON-compatible mostly, except it has unquoted keys. Actually, since I generated it with JSON.stringify and replaced unquoted keys, I can just read torun-remediation-data.json, add the guide, and run the previous replacement.)

const remediationPath = 'e:/TechTrekGT/wayfinder/torun-remediation-data.json';
const remediationData = JSON.parse(fs.readFileSync(remediationPath, 'utf8'));

remediationData.dayTripGuide = {
  title: "Toruń 4-Hour Medieval Stopover Guide",
  steps: [
    {
      step: 1,
      title: "Arrival at Toruń Główny",
      description: "Alight your train at Toruń Główny. Head directly into the main station building to locate the waiting room (poczekalnia).",
      icon: "Train"
    },
    {
      step: 2,
      title: "Secure Your Luggage",
      "description": "Use the self-service luggage lockers located inside the main waiting room. The cost is approximately 15-20 PLN for the day. Lockers accept contactless card payments.",
      icon: "Luggage"
    },
    {
      step: 3,
      title: "Cross the Vistula River",
      description: "Exit the station and walk to the bus stop. Catch Bus 22 or 27. Tap your contactless card on the onboard validator (approx. 3.80 PLN). Ride across the bridge for 5-7 minutes and exit at 'Plac Rapackiego'.",
      icon: "Bus"
    },
    {
      step: 4,
      title: "Enter the Medieval Core",
      description: "From Plac Rapackiego, take a short walk east along Aleja Jana Pawła II or Fosa Staromiejska directly into the pedestrianized Old Town. You will immediately hit the red-brick Gothic architecture.",
      icon: "MapPin"
    },
    {
      step: 5,
      title: "Copernicus & Gingerbread",
      description: "Visit the Nicolaus Copernicus House (Dom Kopernika) for a quick 45-min multimedia tour, then grab a fresh 'Katarzynki' (gingerbread) from one of the official Kopernik bakeries.",
      icon: "Star"
    },
    {
      step: 6,
      title: "Market Square & Lunch",
      description: "Head to Rynek Staromiejski to admire the towering Ratusz (Town Hall). Enjoy a fast, hearty Polish lunch at Karczma Spichrz or grab savory crepes at Restauracja Manekin.",
      icon: "Utensils"
    },
    {
      step: 7,

      title: "Return to the Station",
      description: "Walk back to Plac Rapackiego. Catch Bus 22 or 27 heading South back across the bridge to Toruń Główny. Retrieve your luggage from the lockers and board your onward train.",
      icon: "Train"
    }
  ]
};

// Re-write to remediation data so we keep it updated
fs.writeFileSync(remediationPath, JSON.stringify(remediationData, null, 2));

const replacementContent = JSON.stringify(remediationData, null, 6)
  .replace(/\n/g, '\n    ')
  .replace(/"([^"]+)":/g, '$1:');

const newContent = fileContent.substring(0, startIndex) + replacementContent + fileContent.substring(endIndex);

fs.writeFileSync(dataPath, newContent, 'utf8');
console.log("Successfully added dayTripGuide to Torun object in poland-2026.js");
