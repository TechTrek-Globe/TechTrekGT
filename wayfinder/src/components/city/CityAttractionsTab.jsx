import React from 'react';
import { Sparkles } from 'lucide-react';
import { MustSeeCard } from '../MustSeeCard';

export function CityAttractionsTab({ city }) {
  if (!city.mustSee || city.mustSee.length === 0) return null;

  return (
    <div id="attractions-section" className="space-y-6 animate-fade-in scroll-mt-32">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-white flex items-center space-x-3">
          <Sparkles className="w-7 h-7 text-amber-400" />
          <span>Must-See Attractions in {city.name}</span>
        </h2>
        <span className="text-xs text-wf-muted font-medium">Curated Golden Component template</span>
      </div>

      <div 
        className="grid gap-6 items-stretch"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
      >
        {city.mustSee.map((sight, idx) => (
          <MustSeeCard
            key={idx}
            imageSrc={sight.imageSrc || sight.imageUrl}
            title={sight.title || sight.name}
            category={sight.category}
            description={sight.description}
            locationData={sight.locationData || sight.location}
            costData={sight.costData || sight.pricing}
            hoursData={sight.hoursData || sight.openTimes}
            howToGetThere={sight.howToGetThere}
            daysClosed={sight.daysClosed}
            cityName={city.name}
            sight={sight}
          />
        ))}
      </div>
    </div>
  );
}

export default CityAttractionsTab;
