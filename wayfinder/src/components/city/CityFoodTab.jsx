import React from 'react';
import { Utensils, Wine, MapPin, CheckCircle2, Plus, ExternalLink, Navigation, Compass } from 'lucide-react';
import { DrillDownFilters } from './DrillDownFilters';

export function CityFoodTab({ 
  city, 
  restaurantCategoryFilter, 
  setRestaurantCategoryFilter, 
  savedItems, 
  toggleItinerary, 
  isAuthenticated 
}) {
  const hasDetailed = city[`${city.id}RestaurantsDetailed`] || city[`${city.id}DrinksDetailed`] || city[`${city.id}CafesDetailed`];
  if (!hasDetailed && (!city.restaurants || city.restaurants.length === 0)) return null;

  return (
    <div id="restaurants-section" className="space-y-4 animate-fade-in scroll-mt-32">
      {/* Header Banner */}
      <div className="glass-panel p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-amber-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-amber-500/15 via-purple-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-sm">
              <Utensils className="w-3.5 h-3.5" />
              <Wine className="w-3.5 h-3.5 text-purple-300" />
              <span>Food, Drink & Nightlife Guide</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
              Top Food & Drink Destinations in {city.name}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 font-medium leading-tight">
            Handpicked culinary dining, underground craft breweries, historic Polish vodka houses, bohemian cellar bars, steakhouses, and budget milk bars in {city.name}.
          </p>
        </div>
      </div>

      {/* Sticky Category Filter Toolbar (Stays in view while scrolling) */}
      {hasDetailed && (
        <div className="sticky top-[118px] z-30 py-2.5 px-3 sm:px-5 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-amber-500/30 shadow-2xl transition-all">
          <DrillDownFilters 
            items={[
              ...(city[`${city.id}RestaurantsDetailed`] || []),
              ...(city[`${city.id}DrinksDetailed`] || []),
              ...(city[`${city.id}CafesDetailed`] || [])
            ]}
            activeFilter={restaurantCategoryFilter} 
            onFilterChange={setRestaurantCategoryFilter} 
          />
        </div>
      )}

      {/* Cards Grid */}
      {hasDetailed ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ...(city[`${city.id}RestaurantsDetailed`] || []),
            ...(city[`${city.id}DrinksDetailed`] || []),
            ...(city[`${city.id}CafesDetailed`] || [])
          ]
            .filter((item) => {
              if (restaurantCategoryFilter === 'all') return true;
              if (restaurantCategoryFilter === 'drink-all') return ['vodka-house', 'brewery', 'historic-bar', 'pub', 'watering-hole', 'beer-hall', 'pub-bars'].includes(item.category);
              if (restaurantCategoryFilter === 'food-all') return ['must-haves', 'local', 'expensive', 'steak', 'cheap', 'coffee-breakfast'].includes(item.category);
              if (restaurantCategoryFilter === 'vodka-house') return item.category === 'vodka-house';
              if (restaurantCategoryFilter === 'brewery') return item.category === 'brewery';
              if (restaurantCategoryFilter === 'pub-bars') return ['pub-bars', 'historic-bar', 'pub', 'watering-hole', 'beer-hall'].includes(item.category);
              if (restaurantCategoryFilter === 'coffee-breakfast') return item.category === 'coffee-breakfast';
              return item.category === restaurantCategoryFilter;
            })
            .map((item) => {
              const isCafe = item.category === 'coffee-breakfast';
              const isDrink = ['vodka-house', 'brewery', 'historic-bar', 'pub', 'watering-hole', 'beer-hall'].includes(item.category);
              const isMustHave = item.category === 'must-haves';
              const isLocal = item.category === 'local';
              const isExpensive = item.category === 'expensive';
              const isSteak = item.category === 'steak';
              const isCheap = item.category === 'cheap';
              const isVodka = item.category === 'vodka-house';
              const isBrewery = item.category === 'brewery';

              const badgeStyle = isCafe
                ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                : isVodka
                ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                : isBrewery
                ? 'bg-amber-600/30 text-amber-300 border-amber-500/40'
                : isDrink
                ? 'bg-purple-500/20 text-purple-300 border-purple-400/40'
                : isMustHave
                ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300'
                : isExpensive
                ? 'bg-purple-500/20 text-purple-300 border-purple-400/40'
                : isSteak
                ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                : isCheap
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                : 'bg-pink-500/20 text-pink-300 border-pink-400/40';

              const borderStyle = isCafe
                ? 'border-amber-500/30 hover:border-amber-400/60'
                : (isVodka || isBrewery || isDrink)
                ? 'border-purple-500/30 hover:border-purple-400/60'
                : isMustHave
                ? 'border-amber-500/30 hover:border-amber-400/60'
                : isExpensive
                ? 'border-purple-500/30 hover:border-purple-400/60'
                : isSteak
                ? 'border-rose-500/30 hover:border-rose-400/60'
                : isCheap
                ? 'border-emerald-500/30 hover:border-emerald-400/60'
                : 'border-pink-500/30 hover:border-pink-400/60';

              const mapSearchQuery = encodeURIComponent(`${item.name}, ${city.name}, Poland`);
              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
              const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;

              return (
                <article
                  key={item.id}
                  className={`glass-panel rounded-3xl border ${borderStyle} bg-wf-navy-mid/90 overflow-hidden shadow-xl transition-all duration-300 flex flex-col justify-between group`}
                >
                  <div>
                    {/* Image Header */}
                    <div className="relative w-full h-44 bg-slate-950 overflow-hidden shrink-0">
                      <img
                        src={item.imageSrc}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-transparent to-black/40 pointer-events-none" />

                      {/* Floating Category Pill */}
                      <div className="absolute top-3.5 left-3.5 z-10 flex items-center space-x-2 max-w-[70%]">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border backdrop-blur-md shadow-md truncate ${badgeStyle}`}>
                          {item.categoryLabel}
                        </span>
                      </div>

                      {/* Price Tier Badge */}
                      <div className="absolute top-3.5 right-3.5 z-10 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-amber-400/30 text-amber-300 text-xs font-black shadow-md">
                        {item.priceTier}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 sm:p-6 space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-xl font-black text-white group-hover:text-amber-300 transition-colors leading-tight">
                          {item.name}
                        </h3>
                        <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{item.address}</span>
                        </div>
                      </div>

                      {/* Price & Type Bar */}
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 text-[11px] uppercase tracking-wider">{item.cuisine || item.drinkType}</span>
                        <span className="text-slate-400 font-mono text-[11px] font-semibold">{item.priceEstimatePln}</span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {item.description}
                      </p>

                      {/* Signature Dishes / Drink / Coffee Box */}
                      <div className={`p-3 rounded-2xl border text-xs space-y-1 ${
                        isDrink
                          ? 'bg-purple-500/10 border-purple-500/20 text-purple-200'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                      }`}>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider block ${
                          isDrink ? 'text-purple-300' : 'text-amber-300'
                        }`}>
                          {isCafe ? '☕ Signature Coffee & Morning Fares:' : (isDrink ? '🍷 Signature Drink & Flight:' : '🍽️ Signature Dishes & Fares:')}
                        </span>
                        <p className="font-semibold text-slate-200 leading-snug">{item.signature}</p>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    {isAuthenticated && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleItinerary(item.id);
                        }}
                        className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer ${
                          savedItems.has(item.id)
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                        }`}
                      >
                        {savedItems.has(item.id) ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">Saved</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">Itinerary</span>
                          </>
                        )}
                      </button>
                    )}

                    <a
                      href={item.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                      <span className="truncate">Visit Website</span>
                    </a>

                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                    >
                      <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-amber-300 shrink-0" />
                      <span className="truncate">Directions</span>
                    </a>

                    <a
                      href={mapSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                    >
                      <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                      <span className="truncate">View Map</span>
                    </a>
                  </div>
                </article>
              );
            })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {city.restaurants.map((rest, idx) => (
            <div key={idx} className="glass-panel p-7 rounded-3xl border border-white/10 hover:border-amber-500/30 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-white">{rest.name}</h3>
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs">
                    {rest.price}
                  </span>
                </div>
                <div className="text-xs font-semibold text-amber-400 mb-3">{rest.cuisine}</div>

                <div className="p-3.5 rounded-2xl bg-wf-navy-mid/90 border border-white/5 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-wf-muted block mb-1">🍽️ Signature Dishes</span>
                  <p className="text-sm font-medium text-wf-cream">{rest.signature}</p>
                </div>

                <p className="text-xs text-wf-muted leading-relaxed">
                  💡 <span className="font-medium text-wf-cream">Vibe & Notes:</span> {rest.notes}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CityFoodTab;
