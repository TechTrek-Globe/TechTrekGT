import React from 'react';
import { Landmark, Crown, Award, MapPin, BookOpen, Sparkles, Utensils, ArrowRight, Map, Train, Bus, Compass, Info, Thermometer, CreditCard, Navigation } from 'lucide-react';
import { FormatText, FormatCurrency } from '../Formatters';

export function CityOverviewTab({ city, baseUrl, handleSubPageTabClick, mapUrl, exchangeRates }) {
  return (
    <div className="space-y-10 animate-fade-in">
      {city.history && (
        <section className="glass-panel p-6 sm:p-10 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 relative overflow-hidden shadow-2xl space-y-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center space-x-3 tracking-tight">
              <Landmark className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400" />
              <span>Overview & Heritage of {city.name}</span>
            </h2>
            <span className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
              <Crown className="w-3.5 h-3.5" />
              <span>{city.historyBadge || 'Historic Heritage City'}</span>
            </span>
          </div>

          {/* Historical Stats Grid */}
          {city.historyStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {city.historyStats.map((stat, idx) => (
                <div key={idx} className="p-3 sm:p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-amber-500/40 transition-colors">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80 mb-1 flex items-center space-x-1.5">
                    {stat.icon === 'Crown' && <Crown className="w-3.5 h-3.5" />}
                    {stat.icon === 'Award' && <Award className="w-3.5 h-3.5" />}
                    {stat.icon === 'MapPin' && <MapPin className="w-3.5 h-3.5" />}
                    {stat.icon === 'Landmark' && <Landmark className="w-3.5 h-3.5" />}
                    <span>{stat.label}</span>
                  </div>
                  <div className="text-xs sm:text-sm font-black text-white leading-tight">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Primary Overview Narrative */}
          <p className="text-wf-cream text-sm sm:text-base md:text-lg leading-relaxed font-medium">
            {city.history}
          </p>
        </section>
      )}

      {/* Quick-Jump Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
        {city.historyEpochs && city.historyEpochs.length > 0 && (
          <div className="glass-panel p-5 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <BookOpen className="w-4 h-4" />
                <span>{city.historyEpochs.length} Historical Epochs</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                Chronological Journey Through Time
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                Explore {city.name}'s thousand-year timeline from ancient foundations to royal golden eras, wartime resilience, and UNESCO heritage.
              </p>
            </div>
            <a
              href={`${baseUrl}/history`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/history`)}
              className="inline-flex items-center justify-center space-x-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start min-h-[40px]"
            >
              <BookOpen className="w-4 h-4" />
              <span>View Timeline Tab</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        )}

        {city.mustSee && city.mustSee.length > 0 && (
          <div className="glass-panel p-5 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>{city.mustSee.length} Iconic Landmarks</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                Must-See Attractions
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                Curated iconic sights and architectural landmarks in {city.name} selected for winter exploration.
              </p>
            </div>
            <a
              href={`${baseUrl}/attractions`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/attractions`)}
              className="inline-flex items-center justify-center space-x-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start min-h-[40px]"
            >
              <Sparkles className="w-4 h-4" />
              <span>View All Sights</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        )}

        {city.restaurants && city.restaurants.length > 0 && (
          <div className="glass-panel p-5 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all md:col-span-2 lg:col-span-1">
            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Utensils className="w-4 h-4" />
                <span>Food & Drink Destinations</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                Food & Drink Guide
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                Handpicked dining destinations, craft breweries, historic vodka houses, steakhouses, and local tavern fares in {city.name}.
              </p>
            </div>
            <a
              href={`${baseUrl}/restaurants`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/restaurants`)}
              className="inline-flex items-center justify-center space-x-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start min-h-[40px]"
            >
              <Utensils className="w-4 h-4" />
              <span>View Food & Drink</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        )}
      </div>

      {/* Day Trip Guide Section */}
      {city.dayTripGuide && (
        <section className="space-y-6 pt-4">
          <div className="flex items-center space-x-3 mb-2">
            <Compass className="w-7 h-7 text-emerald-400" />
            <h2 className="text-2xl sm:text-3xl font-black text-white">{city.dayTripGuide.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {city.dayTripGuide.steps.map((step, idx) => (
              <div key={idx} className="glass-panel p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="text-7xl font-black text-emerald-500">{step.step}</span>
                </div>
                <div className="flex items-start space-x-4 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">{step.step}</span>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1.5">{step.title}</h4>
                    <p className="text-sm text-wf-cream leading-relaxed"><FormatText text={step.description} /></p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Transit & Interactive City Map */}
      <section className="space-y-6 pt-4 border-t border-white/10">
        <h2 className="text-3xl font-black text-white flex items-center space-x-3">
          <Map className="w-7 h-7 text-wf-blue-lt" />
          <span>City Map & Transit Guide</span>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Transit Breakdown Cards */}
          <div className="lg:col-span-1 space-y-4 flex flex-col justify-between">
            {city.transit ? (
              <>
                <div className="glass-panel p-5 rounded-2xl border border-wf-blue-lt/30 bg-wf-blue-lt/5">
                  <div className="flex items-center space-x-2 text-wf-blue-lt font-bold text-sm mb-2">
                    <Train className="w-5 h-5" />
                    <span>Airport Transfer</span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed"><FormatText text={city.transit.airport} /></p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm mb-2">
                    <Bus className="w-5 h-5" />
                    <span>Trams & Public Transit</span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.transit.cityTransit}</p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm mb-2">
                    <Landmark className="w-5 h-5" />
                    <span>Central Train Station</span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.transit.station}</p>
                </div>
              </>
            ) : (
              <div className="glass-panel p-6 rounded-2xl border border-white/10">
                <p className="text-sm text-wf-muted">Walkable historic center. Transit passes available via Jakdojade app.</p>
              </div>
            )}
          </div>

          {/* Interactive Map */}
          <div className="lg:col-span-2 glass-panel p-4 rounded-3xl overflow-hidden border border-white/10 min-h-[340px] flex flex-col">
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-xs font-semibold text-wf-muted flex items-center space-x-1">
                <Compass className="w-4 h-4 text-wf-blue-lt" />
                <span>Interactive Navigation Map ({city.name})</span>
              </span>
              <span className="text-xs text-amber-400 font-medium">Use scroll to zoom</span>
            </div>
            <iframe 
              title={`${city.name} Map`}
              className="w-full h-80 sm:h-96 rounded-2xl border-0"
              src={mapUrl}
              loading="lazy"
            ></iframe>
          </div>
        </div>
      </section>

      {/* Practical Visitor Guide (Weather, Currency, Restrooms) */}
      {city.practical && (
        <section className="space-y-4 pt-4 border-t border-white/10">
          <h3 className="text-2xl font-bold text-white flex items-center space-x-3">
            <Info className="w-6 h-6 text-amber-400" />
            <span>Practical Visitor Guide ({city.name})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            <div className="glass-panel p-5 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-2">
              <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
                <Thermometer className="w-5 h-5" />
                <span>December Weather & Gear</span>
              </div>
              <p className="text-xs sm:text-sm text-wf-cream leading-relaxed"><FormatText text={city.practical.weather} /></p>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3 md:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                  <CreditCard className="w-5 h-5" />
                  <span>Currency & Payment Rules</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Live Exchange Rates</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-wf-cream leading-relaxed"><FormatText text={city.practical.currency} /></p>
              
              {/* Live Exchange Rate Callout Box */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/20 space-y-2 text-xs">
                <div className="flex items-center justify-between text-amber-300 font-bold border-b border-white/10 pb-1.5">
                  <span>1 USD ≈ {exchangeRates.usdToPln} PLN</span>
                  <span>1 EUR ≈ {exchangeRates.eurToPln} PLN</span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-300 font-medium">
                  <div className="flex justify-between">
                    <span className="text-slate-400">🚄 Airport SKA1 Train:</span>
                    <span className="font-bold text-amber-200">17 PLN (~<FormatCurrency pln={17} />)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">🚃 24-hr Tram Pass:</span>
                    <span className="font-bold text-amber-200">17 PLN (~<FormatCurrency pln={17} />)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">🎫 72-hr Tram Pass:</span>
                    <span className="font-bold text-amber-200">50 PLN (~<FormatCurrency pln={50} />)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">☕ Mug Deposit (Kaucja):</span>
                    <span className="font-bold text-amber-200">20-30 PLN (~<FormatCurrency pln={20} />-<FormatCurrency pln={30} />)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                <Navigation className="w-5 h-5" />
                <span>Public Restrooms (WC)</span>
              </div>
              <p className="text-xs sm:text-sm text-wf-cream leading-relaxed"><FormatText text={city.practical.restrooms} /></p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default CityOverviewTab;
