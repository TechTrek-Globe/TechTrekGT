import React, { useState, useMemo } from 'react';
import { Sparkles, Bus, MapPin, Footprints } from 'lucide-react';
import { MustSeeCard } from '../MustSeeCard';
import { WalkingLoopOptimizer } from '../route/WalkingLoopOptimizer';
import { optimizeWalkingLoop } from '../../utils/routeOptimizer';

export function CityAttractionsTab({ city }) {
  if (!city.mustSee || city.mustSee.length === 0) return null;

  const [isOptimized, setIsOptimized] = useState(false);
  const [anchorMode, setAnchorMode] = useState(city.markets?.[0] ? 'market' : 'none');
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [includeExcursions, setIncludeExcursions] = useState(false);

  // Compute 2-opt route optimization
  const optimizationResult = useMemo(() => {
    let startAnchor = null;
    if (anchorMode === 'market' && city.markets?.[0]) {
      startAnchor = {
        lat: city.markets[0].lat,
        lng: city.markets[0].lng,
        name: city.markets[0].shortName || city.markets[0].name || `${city.name} Main Market`
      };
    }

    return optimizeWalkingLoop(city.mustSee, {
      startAnchor,
      isRoundTrip,
      includeExcursions,
      walkingSpeedKmh: 4.5
    });
  }, [city.mustSee, city.markets, anchorMode, isRoundTrip, includeExcursions, city.name]);

  const displayedPlaces = isOptimized ? optimizationResult.orderedPlaces : city.mustSee;

  return (
    <div id="attractions-section" className="space-y-6 animate-fade-in scroll-mt-32">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-white flex items-center space-x-3">
          <Sparkles className="w-7 h-7 text-amber-400" />
          <span>Must-See Attractions in {city.name}</span>
        </h2>
        <span className="text-xs text-wf-muted font-medium">Curated Golden Component template</span>
      </div>

      {/* 2-Opt Walking Loop Optimizer Control Panel */}
      <WalkingLoopOptimizer
        city={city}
        isOptimized={isOptimized}
        setIsOptimized={setIsOptimized}
        optimizationResult={optimizationResult}
        anchorMode={anchorMode}
        setAnchorMode={setAnchorMode}
        isRoundTrip={isRoundTrip}
        setIsRoundTrip={setIsRoundTrip}
        includeExcursions={includeExcursions}
        setIncludeExcursions={setIncludeExcursions}
      />

      {/* Primary Attractions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
        {displayedPlaces.map((sight, idx) => (
          <MustSeeCard
            key={sight.id || sight.name || idx}
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
            stepNumber={isOptimized ? idx + 1 : null}
            prevLeg={isOptimized ? optimizationResult.legs[idx] : null}
          />
        ))}
      </div>

      {/* Regional Day-Trip Excursions (Out-of-Town Sights > 12km) */}
      {!includeExcursions && optimizationResult.distantExcursions?.length > 0 && (
        <div className="pt-8 border-t border-white/10 space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-400/30">
              <Bus className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">
                Regional Day-Trip Excursions ({city.name})
              </h3>
              <p className="text-xs text-slate-300">
                These iconic historical sites are located outside {city.name}'s walkable Old Town center. Dedicated regional rail, shuttle buses, or guided day-tours are recommended.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {optimizationResult.distantExcursions.map((sight, idx) => (
              <MustSeeCard
                key={`excursion-${sight.id || idx}`}
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
                isExcursion={true}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CityAttractionsTab;
