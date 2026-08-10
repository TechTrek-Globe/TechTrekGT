// Target Schema for each city in wayfinder/src/data/poland-2026.js
export const citySchema = {
    id: "wroclaw", // or "poznan", "krakow"
    name: "Wrocław",
    tagline: "The Holy Trinity of Polish Christmas Markets",
    overview: "...",
    sections: {
        sights: [
            { id: "s1", name: "", category: "Landmark", description: "", address: "", lat: 0, lng: 0, imageUrl: "", alt: "" }
        ],
        christmasMarkets: [
            { id: "cm1", name: "", location: "", highlights: [], dates: "Nov 20 - Dec 31, 2026", imageUrl: "", alt: "" }
        ],
        food: [
            { id: "f1", name: "", localName: "", type: "Traditional Polish", description: "", priceRange: "$$", imageUrl: "", alt: "" }
        ],
        drinks: [
            { id: "d1", name: "", description: "", bestWhereToTry: "", imageUrl: "", alt: "" }
        ],
        lodging: [
            { id: "l1", name: "", category: "Luxury | Mid-Range | Budget", pricePerNight: "350 PLN", rating: 4.8, address: "", imageUrl: "", alt: "" }
        ],
        lgbtq: {
            safetyScore: "4/5",
            overview: "",
            venues: [
                { name: "", type: "Bar / Club / Cafe", description: "", address: "", imageUrl: "" }
            ],
            safetyTips: []
        }
    }
};