import React, { useState, useEffect } from 'react';
import { 
  Map, 
  MapPin, 
  Train, 
  ArrowRight, 
  ArrowLeft, 
  Calendar, 
  Compass, 
  Clock, 
  Navigation, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Coffee, 
  Lock, 
  Briefcase, 
  Utensils, 
  Plane, 
  Info, 
  X, 
  Zap, 
  ChevronRight,
  Bus,
  CreditCard,
  Layers,
  HelpCircle
} from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

function StationDossierModal({ stationKey, onClose }) {
  const station = polandJourney.stationDossiers?.[stationKey];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!station) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div 
        className="fixed inset-0 cursor-pointer" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative w-full max-w-2xl bg-wf-navy-mid border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl z-10 text-white max-h-[90vh] overflow-y-auto space-y-6">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-black text-xs border border-amber-500/40 uppercase tracking-wider">
                {station.code}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-slate-300 font-bold text-xs">
                {station.badge}
              </span>
              <span className="text-xs text-amber-200/80 font-medium">
                {station.city}, Poland
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              {station.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 italic mt-0.5">
              {station.officialName} ({station.abbreviation})
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors flex-shrink-0"
            aria-label="Close Station Details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Address & Navigation Quick-Action */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>Physical Address & Coordinates</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 font-medium">
              {station.address}
            </p>
          </div>

          <a
            href={station.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-amber-500/20 flex-shrink-0"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Open in Google Maps</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </a>
        </div>

        {/* Core Station Intel Sections */}
        <div className="space-y-4">
          {/* How to Reach */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/5 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center space-x-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span>How to Reach from City Center / Base</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {station.walkingFromCenter}
            </p>
            <div className="pt-1.5 text-xs text-wf-cream/80 border-t border-white/5">
              <span className="font-semibold text-amber-200">Public Transit Lines: </span>
              {station.transitLines}
            </div>
          </div>

          {/* Platform & Concourse Layout */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/5 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center space-x-2">
              <Train className="w-4 h-4 text-sky-400" />
              <span>Platforms & Concourse Layout</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-semibold">
              {station.platforms}
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {station.navigationTip}
            </p>
          </div>

          {/* Luggage Storage & Lockers */}
          <div className="p-4 rounded-2xl bg-amber-950/25 border border-amber-500/30 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Luggage Lockers & Storage (Skrytki Bagażowe)</span>
            </h3>
            <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed font-medium">
              {station.luggageLockers}
            </p>
          </div>

          {/* Station Amenities */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/5 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Station Services, Food & Amenities</span>
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
              {station.amenities.map((item, idx) => (
                <li key={idx} className="flex items-start space-x-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Tip: Keep 2-4 PLN or contactless card ready for paid restrooms (WC).
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}

function CityTransitSection({ cityId }) {
  const transit = polandJourney.cityTransitDirectory?.[cityId];
  if (!transit) return null;

  return (
    <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/40">
              {transit.cityCode} TRANSIT
            </span>
            <span className="text-xs text-slate-400 font-semibold">{transit.badge}</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
            {transit.cityName} City Transportation Guide
          </h3>
          <p className="text-xs text-amber-300 font-medium">Operator: {transit.operator}</p>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
        {transit.summary}
      </p>

      {/* Transit Modes Grid (Subway, Streetcars/Trams, Buses, Rapid Rail) */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>Available Transportation Modes in {transit.cityName}</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {transit.transitTypes.map((mode, idx) => (
            <div 
              key={idx} 
              className={`p-4 rounded-2xl border text-xs space-y-1.5 transition-all ${
                mode.available 
                  ? 'bg-slate-900/90 border-white/10 hover:border-amber-500/40' 
                  : 'bg-slate-950/40 border-white/5 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm flex items-center space-x-1.5">
                  {mode.name.includes('Tram') ? <Train className="w-4 h-4 text-amber-400" /> : null}
                  {mode.name.includes('Bus') ? <Bus className="w-4 h-4 text-sky-400" /> : null}
                  {mode.name.includes('Rail') || mode.name.includes('Commuter') ? <Zap className="w-4 h-4 text-emerald-400" /> : null}
                  {mode.name.includes('Metro') || mode.name.includes('Subway') ? <HelpCircle className="w-4 h-4 text-slate-400" /> : null}
                  <span>{mode.name}</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  mode.available 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}>
                  {mode.available ? 'Active & Available' : 'Not Present'}
                </span>
              </div>
              <div className="text-[11px] text-amber-300 font-mono font-medium">{mode.networkScale}</div>
              <p className="text-slate-300 leading-relaxed">{mode.details}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fares & Payment Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2 text-xs">
          <div className="font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
            <CreditCard className="w-4 h-4 text-amber-400" />
            <span>Fares & Ticket Types</span>
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {Object.entries(transit.tickets || {}).map(([tName, tVal]) => (
              <li key={tName} className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 border-b border-white/5 pb-1">
                <span className="text-slate-400 uppercase text-[10px] font-mono">{tName.replace(/([A-Z])/g, ' $1')}</span>
                <span className="text-white font-semibold text-right">{tVal}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2 text-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Zap className="w-4 h-4 text-sky-400" />
              <span>How to Pay & Ride</span>
            </div>
            <p className="text-slate-300 leading-relaxed">{transit.paymentMethods}</p>
          </div>

          <div className="pt-2 border-t border-white/5 text-amber-200">
            <span className="font-bold">Recommended App: </span>
            <span className="text-slate-300">{transit.appRecommendation}</span>
          </div>
        </div>
      </div>

      {/* Key Routes for Sightseers */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1">
        <div className="font-bold text-emerald-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Navigation className="w-4 h-4 text-emerald-400" />
          <span>Key Lines for Holiday Sightseeing & Base Transit</span>
        </div>
        <p className="text-slate-200 leading-relaxed font-medium">{transit.keyRoutesForVisitors}</p>
      </div>
    </div>
  );
}

export function RouteVisualization() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'krakow', 'wroclaw', 'poznan', 'torun', 'gdansk', 'all-transit', 'guide'
  const [activeStationModal, setActiveStationModal] = useState(null);

  const pushRoute = (e, path) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const getStationKey = (cityNameOrCode) => {
    const s = (cityNameOrCode || '').toLowerCase();
    if (s.includes('krak') || s.includes('krk')) return 'krakow';
    if (s.includes('wroc') || s.includes('wro')) return 'wroclaw';
    if (s.includes('pozn') || s.includes('poz')) return 'poznan';
    if (s.includes('toru') || s.includes('tor')) return 'torun';
    if (s.includes('gda') || s.includes('gdn')) return 'gdansk';
    if (s.includes('airport') || s.includes('balice')) return 'airport-krk';
    return null;
  };

  const tabs = [
    { id: 'overview', label: 'Full Route & Overview', icon: Map, badge: 'All 4 Legs' },
    { id: 'krakow', label: 'Kraków', code: 'KRK', icon: Train, badge: 'Stop 01' },
    { id: 'wroclaw', label: 'Wrocław', code: 'WRO', icon: Train, badge: 'Stop 02' },
    { id: 'poznan', label: 'Poznań', code: 'POZ', icon: Train, badge: 'Stop 03' },
    { id: 'torun', label: 'Toruń', code: 'TOR', icon: Train, badge: 'Day Stop' },
    { id: 'gdansk', label: 'Gdańsk', code: 'GDN', icon: Train, badge: 'Finale' },
    { id: 'all-transit', label: 'All City Transit', icon: Bus, badge: 'Matrix' },
    { id: 'guide', label: 'Rail Survival Guide', icon: Info, badge: 'Pro Tips' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6 min-w-0">
        <div>
          <a 
            href="/wayfinder/poland-christmas-2026" 
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} 
            className="inline-flex items-center text-xs sm:text-sm font-semibold text-wf-muted hover:text-white transition-colors mb-2 group"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-1" />
            <span>Back to Poland 2026 Overview</span>
          </a>

          <h1 className="text-2xl sm:text-4xl font-black text-white flex items-center space-x-3 tracking-tight">
            <Map className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 shrink-0" />
            <span>Route Map & Transit Guide</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed font-medium">
            Select any city below for detailed station dossiers, walking & tram directions, local public transportation options (trams, streetcars, buses, commuter rail), and connecting train legs.
          </p>
        </div>

        <a
          href="/wayfinder/poland-christmas-2026/itinerary"
          onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/itinerary')}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md shadow-amber-500/20 self-start sm:self-auto shrink-0 min-h-[40px]"
        >
          <Calendar className="w-4 h-4" />
          <span>10-Day Itinerary</span>
        </a>
      </div>

      {/* Primary Clickable City & Section Tabs (Top Navigation) */}
      <div className="sticky top-14 z-30 py-2 px-3 sm:px-4 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-white/10 shadow-lg w-full overflow-x-auto no-scrollbar no-overscroll-x">
        <div className="flex items-center space-x-2 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer shrink-0 min-h-[40px] ${
                  isActive 
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 scale-[1.02]' 
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-white/10'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                <span>{tab.label}</span>
                {tab.code && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-white/10 text-amber-300'
                  }`}>
                    {tab.code}
                  </span>
                )}
                {tab.badge && !tab.code && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-white/10 text-slate-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: FULL ROUTE OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Main Visual Route Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Visual Route Progression */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-card rounded-3xl p-5 sm:p-6 border border-amber-500/30 bg-wf-navy-mid/95 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <Compass className="w-4 h-4 text-amber-400" />
                    <span>South-to-North Progression</span>
                  </h2>
                  <span className="text-[11px] text-amber-300 font-mono font-semibold">
                    {polandJourney.dates}
                  </span>
                </div>

                {/* Inbound Flight Transfer */}
                <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs">
                    <Plane className="w-4 h-4 text-sky-400 rotate-45" />
                    <div>
                      <span className="font-bold text-white">Air Arrival: </span>
                      <span className="text-sky-300 font-mono">KRK (Balice)</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveStationModal('airport-krk')}
                    className="px-2 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-bold border border-sky-500/40 transition-colors"
                  >
                    Transfer Dossier
                  </button>
                </div>

                {/* Vertical Interactive City Track */}
                <div className="relative pl-6 space-y-7 border-l-2 border-amber-500/40 my-4 ml-3">
                  {polandJourney.route.map((city, idx) => {
                    const stationKey = city.id;
                    const station = polandJourney.stationDossiers?.[stationKey];
                    const isFirst = idx === 0;
                    const isLast = idx === polandJourney.route.length - 1;

                    return (
                      <div key={city.id} className="relative group">
                        <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 transition-transform group-hover:scale-125 ${
                          isFirst 
                            ? 'bg-amber-400 border-white shadow-[0_0_10px_rgba(251,191,36,0.8)]' 
                            : isLast 
                              ? 'bg-emerald-400 border-white shadow-[0_0_10px_rgba(52,211,153,0.8)]' 
                              : 'bg-slate-900 border-amber-400'
                        }`} />

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => setActiveTab(city.id)}
                              className="text-sm font-bold text-white hover:text-amber-300 transition-colors text-left"
                            >
                              {city.name}
                            </button>
                            <span className="text-[10px] text-amber-300 font-mono font-medium">
                              {city.nights > 0 ? `${city.nights} nights` : 'Day Stop'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">
                              {city.itineraryDates ? city.itineraryDates.split(',')[0] : city.travelDays}
                            </span>

                            <button
                              onClick={() => setActiveTab(city.id)}
                              className="px-2 py-0.5 rounded bg-white/5 hover:bg-amber-500 hover:text-slate-950 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/30 transition-colors"
                            >
                              Open City Tab →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Outbound Flight Transfer */}
                <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs">
                    <Plane className="w-4 h-4 text-sky-400 -rotate-45" />
                    <div>
                      <span className="font-bold text-white">Air Departure: </span>
                      <span className="text-sky-300 font-mono">GDN (Lech Wałęsa)</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveStationModal('airport-gdn')}
                    className="px-2 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-bold border border-sky-500/40 transition-colors"
                  >
                    Transfer Dossier
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: All 4 Leg Summary Cards */}
            <div className="lg:col-span-7 space-y-5">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                <Train className="w-5 h-5 text-amber-400" />
                <span>Intercity Rail Corridor (~745 km)</span>
              </h2>

              {polandJourney.railConnections.map((leg) => {
                const isDayStop = leg.id === 'leg-3-poznan-torun';

                return (
                  <div 
                    key={leg.id}
                    className={`glass-panel p-5 sm:p-6 rounded-2xl border transition-all space-y-4 ${
                      isDayStop ? 'border-amber-500/50 bg-amber-950/15' : 'border-white/10 bg-wf-navy-mid/90'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-black text-xs flex items-center justify-center border border-amber-500/40">
                          0{leg.legNumber}
                        </span>
                        <h3 className="font-bold text-white text-base">
                          {leg.fromCity} ➔ {leg.toCity}
                        </h3>
                      </div>
                      <div className="text-xs text-amber-300 font-medium">
                        {leg.distanceKm} km • {leg.duration}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Departure</span>
                        <span className="font-bold text-white">{leg.from} [{leg.fromCode}]</span>
                        <span className="block text-slate-300 text-[11px] mt-0.5">{leg.timing}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Arrival</span>
                        <span className="font-bold text-white">{leg.to} [{leg.toCode}]</span>
                        <span className="block text-slate-300 text-[11px] mt-0.5">{leg.arrivalTiming}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-300 italic">{leg.class}</span>
                      <button
                        onClick={() => setActiveTab(getStationKey(leg.fromCode))}
                        className="text-amber-400 hover:text-white font-bold flex items-center space-x-1"
                      >
                        <span>Explore {leg.fromCity} Transit</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: PER-CITY SPECIFIC VIEW (Kraków, Wrocław, Poznań, Toruń, Gdańsk) */}
      {['krakow', 'wroclaw', 'poznan', 'torun', 'gdansk'].includes(activeTab) && (
        <div className="space-y-8 animate-fade-in">
          {(() => {
            const station = polandJourney.stationDossiers?.[activeTab];
            const cityRouteObj = polandJourney.route.find(c => c.id === activeTab);
            const departingLeg = polandJourney.railConnections.find(l => getStationKey(l.fromCode) === activeTab);
            const arrivingLeg = polandJourney.railConnections.find(l => getStationKey(l.toCode) === activeTab);

            return (
              <div className="space-y-8">
                {/* City Hero & Station Dossier Banner */}
                {station && (
                  <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-3 py-1 rounded-md bg-amber-500 text-slate-950 font-black text-xs font-mono uppercase tracking-wider">
                            {station.code} STATION
                          </span>
                          <span className="px-2.5 py-1 rounded-md bg-white/10 text-amber-300 font-bold text-xs">
                            {station.badge}
                          </span>
                          <span className="text-xs text-slate-300 font-medium">
                            {cityRouteObj?.nights ? `${cityRouteObj.nights} Nights` : 'Day Trip Stop'} ({cityRouteObj?.itineraryDates?.split(',')[0]})
                          </span>
                        </div>

                        <h2 className="text-2xl sm:text-3xl font-black text-white">
                          {station.name}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-300 mt-1 break-words">
                          {station.officialName} • {station.address}
                        </p>
                      </div>

                      <a
                        href={station.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-amber-500/20 self-start sm:self-auto shrink-0 min-h-[40px] w-full sm:w-auto"
                      >
                        <Navigation className="w-4 h-4 shrink-0" />
                        <span><span className="hidden sm:inline">Navigate in </span>Google Maps</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>

                    {/* Quick Station Specs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/5 space-y-1.5">
                        <div className="text-sky-300 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                          <Train className="w-4 h-4" />
                          <span>Platforms & Concourse</span>
                        </div>
                        <p className="text-slate-200 font-semibold">{station.platforms}</p>
                        <p className="text-slate-400 text-[11px]">{station.navigationTip}</p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/5 space-y-1.5">
                        <div className="text-amber-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                          <Lock className="w-4 h-4" />
                          <span>Luggage Lockers</span>
                        </div>
                        <p className="text-amber-100/90 leading-relaxed font-medium">{station.luggageLockers}</p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/5 space-y-1.5">
                        <div className="text-emerald-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                          <Compass className="w-4 h-4" />
                          <span>Reaching Center & Hotels</span>
                        </div>
                        <p className="text-slate-200 leading-relaxed">{station.walkingFromCenter}</p>
                        <p className="text-amber-300 text-[11px] font-semibold">{station.transitLines}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Local City Transportation Breakdown */}
                <CityTransitSection cityId={activeTab} />

                {/* Connected Intercity Rail Legs */}
                <div className="space-y-4">
                  <h3 className="text-xl font-black text-white flex items-center space-x-2">
                    <Train className="w-5 h-5 text-amber-400" />
                    <span>Connecting Intercity Rail Legs</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {arrivingLeg && (
                      <div className="glass-panel p-5 rounded-2xl border border-white/10 bg-wf-navy-mid/80 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold">Arriving Leg 0{arrivingLeg.legNumber}</span>
                          <span className="text-amber-300 font-medium">{arrivingLeg.duration}</span>
                        </div>
                        <h4 className="text-base font-bold text-white">
                          From {arrivingLeg.fromCity} ➔ {arrivingLeg.toCity}
                        </h4>
                        <p className="text-xs text-slate-300">{arrivingLeg.timing} ({arrivingLeg.trainType})</p>
                        <div className="text-xs text-slate-400 pt-2 border-t border-white/5">
                          <strong className="text-slate-200">Arrival Transit: </strong>{arrivingLeg.destNav}
                        </div>
                      </div>
                    )}

                    {departingLeg && (
                      <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-wf-navy-mid/80 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">Departing Leg 0{departingLeg.legNumber}</span>
                          <span className="text-amber-300 font-medium">{departingLeg.duration}</span>
                        </div>
                        <h4 className="text-base font-bold text-white">
                          From {departingLeg.fromCity} ➔ {departingLeg.toCity}
                        </h4>
                        <p className="text-xs text-slate-300">{departingLeg.timing} ({departingLeg.trainType})</p>
                        <div className="text-xs text-slate-400 pt-2 border-t border-white/5">
                          <strong className="text-amber-200">Departure Access: </strong>{departingLeg.originNav}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB: ALL CITY TRANSIT SYSTEMS COMPARISON */}
      {activeTab === 'all-transit' && (
        <div className="space-y-8 animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center space-x-2">
                <Bus className="w-6 h-6 text-amber-400" />
                <span>All 5 Cities Public Transportation Guide</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Comprehensive matrix of public transit options across Poland: Streetcars, fast trams, city buses, commuter rail, and ticket systems.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            {['krakow', 'wroclaw', 'poznan', 'torun', 'gdansk'].map(cityId => (
              <CityTransitSection key={cityId} cityId={cityId} />
            ))}
          </div>
        </div>
      )}

      {/* TAB: POLISH RAIL SURVIVAL GUIDE */}
      {activeTab === 'guide' && (
        <div className="space-y-8 animate-fade-in">
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/30 bg-wf-navy-mid/95 space-y-6">
            <h2 className="text-2xl font-black text-white flex items-center space-x-2">
              <Info className="w-6 h-6 text-amber-400" />
              <span>Polish Railway & Public Transit Survival Guide</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="font-bold text-amber-300 text-sm flex items-center space-x-2">
                  <Train className="w-4 h-4 text-amber-400" />
                  <span>Peron vs. Tor (Platform vs. Track)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Crucial Polish rail distinction: <strong className="text-white">Peron</strong> is the physical platform island, while <strong className="text-white">Tor</strong> is the specific rail track beside it. For example, "Peron 2, Tor 3" means Platform 2, Track 3. Electronic departure boards list both.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="font-bold text-amber-300 text-sm flex items-center space-x-2">
                  <Navigation className="w-4 h-4 text-amber-400" />
                  <span>Finding Your Wagon (Wagon Numer)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Platforms have overhead sector displays (<strong className="text-white">Sektor A, B, C</strong>). Look at the digital platform train diagram (Infogabaryt) to see exactly which sector your carriage (Wagon) will stop in, saving frantic runs with luggage.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="font-bold text-sky-300 text-sm flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-sky-400" />
                  <span>Universal App: Jakdojade</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  The <strong className="text-white">Jakdojade app</strong> is used across all 5 Polish cities (Kraków, Wrocław, Poznań, Toruń, Tri-City). It provides real-time route planning, live GPS tracking of trams and buses, and allows instant in-app ticket purchases via Apple Pay, Google Pay, or card.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="font-bold text-emerald-300 text-sm flex items-center space-x-2">
                  <Utensils className="w-4 h-4 text-emerald-400" />
                  <span>WARS Dining Car & Onboard Meals</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Polish PKP trains feature full-service <strong className="text-white">WARS bistro cars</strong> serving fresh hot meals (traditional żurek soup, scrambled eggs, pierogi, Polish sausage, espresso). Contactless credit card is accepted at all tables.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Station Dossier Modal Component */}
      {activeStationModal && (
        <StationDossierModal
          stationKey={activeStationModal}
          onClose={() => setActiveStationModal(null)}
        />
      )}
    </div>
  );
}

