import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { MapPin, Utensils, Bed, ArrowLeft, ArrowRight, Bus, Train, ShoppingBag, Sparkles, Landmark, Compass, DollarSign, Info, Map, Clock, Navigation, Gift, Lightbulb, Video, ExternalLink, Thermometer, CreditCard, Award, RefreshCw, AlertTriangle, CalendarX, Coins, Coffee, Sun, Volume2, Crown, BookOpen, Scroll, Flame, ShieldCheck, Heart, Users, Phone, Star, CheckCircle2, Lock, Wine, GlassWater, ChevronDown, Plus } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { cityImages, marketImages, attractionImages, getAttractionImage } from '../utils/cityImages';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { MustSeeCard } from './MustSeeCard';
import { useAuth } from '../context/AuthContext';
import { FormatDistance, FormatCurrency, FormatText } from './Formatters';

function QuickReferenceBar({ city }) {
  const quick = city.quickReference || {
    dates: city.dates,
    daylight: 'Sunrise ~7:30 AM | Sunset ~3:30 PM (~8 hrs daylight)',
    peakHours: '5:30 PM - 8:00 PM (Dusk illuminations & caroling)',
    kaucja: `${city.kaucja} deposit per mug`
  };

  const kaucjaDeposit = typeof city.kaucjaCallout === 'object' ? city.kaucjaCallout.deposit : (city.kaucja || '20-30 PLN');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Market Dates</span>
        </div>
        <p className="text-xs sm:text-sm text-white font-bold leading-snug">
          {quick.dates}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
          <Sun className="w-4 h-4 shrink-0" />
          <span>Daylight & Sunset</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-snug font-medium">
          {quick.daylight}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Peak Atmosphere</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-snug font-medium">
          {quick.peakHours}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-400/50 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
          <Coffee className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Mug Deposit (Kaucja)</span>
        </div>
        <p className="text-xs sm:text-sm text-amber-100/90 leading-snug font-medium">
          <FormatText text={kaucjaDeposit} /> deposit per mug. <strong className="text-amber-300">EXACT CASH REQUIRED</strong> for deposit.
        </p>
      </div>
    </div>
  );
}

function CulinaryHighlightsSection({ highlights }) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-1">
            <Utensils className="w-4 h-4" />
            <span>Authentic Market Flavors</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Culinary Highlights & Pronunciation Guide</h2>
        </div>
        <span className="text-xs text-slate-400 font-medium">Phonetics included for easy ordering</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {highlights.map((item, idx) => (
          <div key={idx} className="glass-panel p-6 rounded-3xl border border-amber-500/20 hover:border-amber-500/50 bg-wf-navy-mid/90 transition-all flex flex-col justify-between group shadow-lg">
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition-colors leading-snug">
                  {item.name}
                </h3>
                <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold shrink-0 flex items-center space-x-1 max-w-full">
                  <Volume2 className="w-3 h-3 text-amber-400" />
                  <span>Pronunciation</span>
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-xs text-amber-300 tracking-wide flex items-center space-x-2">
                <span className="text-slate-500 select-none">🗣️</span>
                <span className="font-semibold">{item.phonetic}</span>
              </div>

              <div className="text-xs font-bold text-amber-400/90 uppercase tracking-wider">
                {item.english}
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                {item.description}
              </p>
            </div>

            {item.tip && (
              <div className="mt-4 pt-3 border-t border-white/10 text-xs text-emerald-300 flex items-start space-x-2">
                <span className="shrink-0 mt-0.5">💡</span>
                <span className="leading-snug">{item.tip}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const RAW_FILTER_CATEGORIES = [
  { id: 'food-all', title: 'All Dining', Icon: Utensils, activeClass: 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  { id: 'must-haves', title: 'Must-Haves', Icon: Utensils, activeClass: 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/20', inactiveClass: 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10' },
  { id: 'local', title: 'Local Fares', Icon: Utensils, activeClass: 'bg-pink-500 text-white shadow-md shadow-pink-500/20', inactiveClass: 'bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30' },
  { id: 'steak', title: 'Steakhouses', Icon: Flame, activeClass: 'bg-rose-600 text-white shadow-md shadow-rose-500/20', inactiveClass: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30' },
  { id: 'cheap', title: 'Cheap Eats', Icon: Coins, activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20', inactiveClass: 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-300 border border-emerald-600/30' },
  { id: 'expensive', title: 'Fine Dining', Icon: Award, activeClass: 'bg-purple-600 text-white shadow-md shadow-purple-500/20', inactiveClass: 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border border-purple-600/30' },
  { id: 'coffee-breakfast', title: 'Coffee & Breakfast', Icon: Coffee, activeClass: 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },

  { id: 'drink-all', title: 'All Drinks', Icon: Wine, activeClass: 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400', inactiveClass: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  { id: 'pub-bars', title: 'Pubs & Bars', Icon: GlassWater, activeClass: 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  { id: 'vodka-house', title: 'Vodka Houses', Icon: Crown, activeClass: 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  { id: 'brewery', title: 'Breweries', Icon: GlassWater, activeClass: 'bg-amber-600 text-white shadow-md shadow-amber-600/20', inactiveClass: 'bg-amber-600/10 hover:bg-amber-600/20 text-amber-300 border border-amber-600/30' }
];

function DrillDownFilters({ activeFilter, onFilterChange, items = [] }) {
  const [activeTier, setActiveTier] = useState('main'); // 'main', 'eat', 'drink'

  const eatCategories = ['food-all', 'must-haves', 'local', 'steak', 'cheap', 'expensive', 'coffee-breakfast'];
  const drinkCategories = ['drink-all', 'pub-bars', 'vodka-house', 'brewery'];

  const isEatCategory = (cat) => eatCategories.includes(cat);
  const isDrinkCategory = (cat) => drinkCategories.includes(cat);

  const getCount = (catId) => {
    if (catId === 'food-all') {
      return items.filter(i => ['must-haves', 'local', 'expensive', 'steak', 'cheap', 'coffee-breakfast'].includes(i.category)).length;
    }
    if (catId === 'drink-all') {
      return items.filter(i => ['vodka-house', 'brewery', 'historic-bar', 'pub', 'watering-hole', 'beer-hall', 'pub-bars'].includes(i.category)).length;
    }
    if (catId === 'pub-bars') {
      return items.filter(i => ['pub-bars', 'historic-bar', 'pub', 'watering-hole', 'beer-hall'].includes(i.category)).length;
    }
    return items.filter(i => i.category === catId).length;
  };

  const totalEat = getCount('food-all');
  const totalDrink = getCount('drink-all');

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full py-0.5">
      {activeTier === 'main' ? (
        <>
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer min-h-[36px] ${
              activeFilter === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            All Food & Drink ({items.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTier('eat');
              onFilterChange('food-all');
            }}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 cursor-pointer min-h-[36px] ${
              isEatCategory(activeFilter)
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Eat ({totalEat})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTier('drink');
              onFilterChange('drink-all');
            }}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 cursor-pointer min-h-[36px] ${
              isDrinkCategory(activeFilter)
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
            }`}
          >
            <Wine className="w-3.5 h-3.5" />
            <span>Drink ({totalDrink})</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setActiveTier('main');
              onFilterChange('all');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center space-x-1.5 min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          {(activeTier === 'eat' ? eatCategories : drinkCategories).map((catId) => {
            const catDef = RAW_FILTER_CATEGORIES.find(c => c.id === catId);
            if (!catDef) return null;
            const count = getCount(catId);
            const Icon = catDef.Icon;
            const isActive = activeFilter === catId;
            return (
              <button
                key={catId}
                type="button"
                onClick={() => onFilterChange(catId)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer min-h-[36px] ${
                  isActive ? catDef.activeClass : catDef.inactiveClass
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{catDef.title} ({count})</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

function CityHeroImageCard({ 
  imageSrc, 
  alt, 
  location, 
  landmark, 
  description, 
  isLgbtq = false, 
  heightClass = "h-72 sm:h-96" 
}) {
  const borderClass = isLgbtq ? "border-purple-500/30" : "border-amber-500/30";
  const textAccClass = isLgbtq ? "text-purple-300" : "text-amber-300";
  const icon = isLgbtq ? "🏳️‍🌈" : "🏛️";

  return (
    <div 
      className={`w-full lg:w-7/12 ${heightClass} rounded-2xl overflow-hidden relative bg-slate-950 border ${borderClass} shadow-inner group shrink-0`}
    >
      <img 
        src={imageSrc} 
        alt={alt} 
        className="absolute inset-0 w-full h-full object-cover object-center opacity-90"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/30 to-transparent"></div>

      {landmark && (
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 shadow-lg flex items-center">
            <span className={`text-xs ${textAccClass} font-bold flex items-center space-x-1.5 truncate`}>
              <span>{icon}</span>
              <span className="truncate">{landmark}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CityPage({ cityId, subPage = 'overview' }) {
  const [activeMarketTab, setActiveMarketTab] = useState(0);
  const [activeEpochTab, setActiveEpochTab] = useState('all');
  const [hotelTierFilter, setHotelTierFilter] = useState('all');
  const [restaurantCategoryFilter, setRestaurantCategoryFilter] = useState('all');
  const [lgbtqCategoryFilter, setLgbtqCategoryFilter] = useState('all');
  const [savedItems, setSavedItems] = useState(() => {
    try {
      const saved = localStorage.getItem('wayfinder_saved_items');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleItinerary = (id) => {
    setSavedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem('wayfinder_saved_items', JSON.stringify([...next]));
      } catch (err) {
        console.error('Failed to save itinerary item:', err);
      }
      return next;
    });
  };
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();
  const exchangeRates = useExchangeRate();
  const subPageSectionRef = useRef(null);

  const pushRoute = (e, path) => {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const scrollToSubPageArea = () => {
    if (subPageSectionRef.current) {
      const yOffset = -115; // Accounts for sticky navbar (56px) + sticky sub-toolbar (~48px) + breathing room
      const y = subPageSectionRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  const cityHeaderRef = useRef(null);

  const scrollToCityHeader = () => {
    if (cityHeaderRef.current) {
      const yOffset = -60; // Offset for sticky navbar
      const y = cityHeaderRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  const handleSubPageTabClick = (e, path) => {
    if (e) e.preventDefault();
    const isOverview = path === baseUrl || path === `${baseUrl}/` || path.endsWith(`/${cityId}`);
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (isOverview) {
      setTimeout(scrollToCityHeader, 30);
    } else {
      setTimeout(scrollToSubPageArea, 30);
    }
  };

  const city = polandJourney.route.find(c => c.id === cityId);

  if (!city) {
    return (
      <div className="flex-1 flex items-center justify-center text-wf-muted p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">City Not Found</h2>
          <p>We couldn't find the city you're looking for in this journey.</p>
        </div>
      </div>
    );
  }

  const baseUrl = `/wayfinder/poland-christmas-2026/cities/${cityId}`;

  const activeSubPage = ['history', 'timeline', 'history-timeline', 'chronological'].includes(subPage)
    ? 'history'
    : (['attractions', 'sights', 'must-see', 'must-see-sights'].includes(subPage)
      ? 'attractions'
      : (['restaurants', 'food', 'dining', 'top-restaurants', 'food-drink', 'drinks', 'bars', 'pubs', 'breweries'].includes(subPage)
        ? 'restaurants'
        : (['markets', 'market', 'christmas-markets'].includes(subPage)
          ? 'markets'
          : (['hotels', 'stays', 'base'].includes(subPage)
            ? 'hotels'
            : (['lgbtq', 'gay', 'queer', 'lgbt', 'lgbtq-guide'].includes(subPage)
              ? 'lgbtq'
              : 'overview')))));

  React.useLayoutEffect(() => {
    if (activeSubPage !== 'overview') {
      setTimeout(scrollToSubPageArea, 50);
    } else if (cityHeaderRef.current) {
      const yOffset = -60;
      const y = cityHeaderRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    }
  }, [cityId, activeSubPage]);

  // Dynamic Page Title, Meta Description, Canonical URL, Open Graph & JSON-LD Structured Data
  useEffect(() => {
    if (!city) return;

    const pageTitle = activeSubPage !== 'overview'
      ? `${city.name} ${activeSubPage.charAt(0).toUpperCase() + activeSubPage.slice(1)} | Poland Christmas 2026`
      : `${city.name} Travel Guide & Christmas Market 2026 | TechTrek Wayfinder`;

    document.title = pageTitle;

    const canonicalUrl = `https://techtrekgt.com/wayfinder/poland-christmas-2026/cities/${city.id}${activeSubPage !== 'overview' ? '/' + activeSubPage : ''}`;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = `Explore ${city.name} during Christmas 2026. ${city.focus || city.description || ''} Complete guide with hotels, food, markets, and attractions.`;

    // Canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonicalUrl;

    // Open Graph Title
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.content = pageTitle;

    // Open Graph Description
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.content = metaDesc.content;

    // Open Graph URL
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.content = canonicalUrl;

    // JSON-LD Structured Data
    // Parse display date string (e.g. "Nov 21, 2026 - Jan 7, 2027") into ISO 8601 start/end
    const parseDateRange = (dateRange) => {
      if (!dateRange) return { start: '2026-11-21', end: '2027-01-07' };
      const parts = dateRange.split('-').map(s => s.trim());
      if (parts.length < 2) return { start: '2026-11-21', end: '2027-01-07' };
      const toIso = (raw) => {
        const m = String(raw).match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
        if (!m) return null;
        const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
        const mm = months[m[1]];
        if (!mm) return null;
        return `${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}`;
      };
      const start = toIso(parts[0]);
      const end = toIso(parts[1]);
      return { start: start || '2026-11-21', end: end || '2027-01-07' };
    };
    const { start: jsonLdStart, end: jsonLdEnd } = parseDateRange(city.dates);

    let jsonLdScript = document.getElementById('city-json-ld');
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.id = 'city-json-ld';
      jsonLdScript.type = 'application/ld+json';
      document.head.appendChild(jsonLdScript);
    }
    jsonLdScript.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TouristDestination',
      'name': `${city.name} Christmas Market 2026`,
      'description': city.focus,
      'url': canonicalUrl,
      'event': {
        '@type': 'Event',
        'name': `${city.name} Christmas Market 2026`,
        'startDate': jsonLdStart,
        'endDate': jsonLdEnd,
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'eventStatus': 'https://schema.org/EventScheduled',
        'location': {
          '@type': 'Place',
          'name': `${city.name} Main Market Square`,
          'address': {
            '@type': 'PostalAddress',
            'addressLocality': city.name,
            'addressCountry': 'PL'
          }
        }
      }
    });

  }, [city, activeSubPage]);

  // OpenStreetMap embed bbox for Kraków, Wrocław, or generic fallback
  const mapUrl = cityId === 'krakow'
    ? "https://www.openstreetmap.org/export/embed.html?bbox=19.9200%2C50.0450%2C19.9650%2C50.0700&amp;layer=mapnik&amp;marker=50.0614%2C19.9366"
    : cityId === 'wroclaw'
      ? "https://www.openstreetmap.org/export/embed.html?bbox=17.0150%2C51.1000%2C17.0500%2C51.1200&amp;layer=mapnik&amp;marker=51.1095%2C17.0318"
      : "https://www.openstreetmap.org/export/embed.html?bbox=16.9000%2C51.1000%2C17.1000%2C51.1300&amp;layer=mapnik";

  return (
    <div ref={cityHeaderRef} className="w-full max-w-6xl min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Navigation Header with Horizontal Trail Track Chart (07:48 Version) */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Back Button */}
          <a 
            href="/wayfinder/poland-christmas-2026?scroll=journey-sequence" 
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026?scroll=journey-sequence')} 
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-sm border border-amber-500/40 hover:border-amber-400 transition-all duration-300 shadow-lg shadow-amber-900/30 hover:shadow-amber-500/30 hover:scale-105 shrink-0 group self-start lg:self-auto"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Poland Journey Overview</span>
          </a>

          {/* Prominent Wide Horizontal Trail Track Chart */}
          <div className="flex-1 glass-panel px-5 py-4 rounded-2xl border-2 border-amber-500/40 bg-wf-navy-mid/95 backdrop-blur-xl shadow-2xl flex items-center justify-between min-w-0 overflow-x-auto no-scrollbar no-overscroll-x">
            <div className="flex items-center justify-between w-full min-w-[580px] relative px-4 py-3">
              {/* Thick Visible Railroad Track Line */}
              <div className="absolute top-[32px] left-8 right-8 h-2.5 bg-slate-950 border-y-2 border-amber-400 rounded-full z-0 flex items-center justify-around overflow-hidden shadow-inner">
                {/* Railroad ties pattern */}
                <div className="w-full h-full bg-[linear-gradient(90deg,transparent_50%,rgba(245,158,11,0.6)_50%)] bg-[length:12px_100%] opacity-90"></div>
              </div>

              {polandJourney.route.map((item, idx) => {
                const isCurrent = item.id === cityId;
                const itemUrl = `/wayfinder/poland-christmas-2026/cities/${item.id}`;
                const isLast = idx === polandJourney.route.length - 1;

                return (
                  <React.Fragment key={item.id}>
                    {/* City Avatar Node */}
                    <a
                      href={itemUrl}
                      onClick={(e) => pushRoute(e, itemUrl)}
                      className={`relative z-10 flex flex-col items-center group cursor-pointer shrink-0 transition-transform ${
                        isCurrent ? 'z-20' : 'opacity-70 hover:opacity-100'
                      }`}
                      title={`${item.name} (${item.nights > 0 ? `${item.nights} Nights` : 'Day Stop'})`}
                    >
                      {/* Active City "YOU ARE HERE" Badge */}
                      {isCurrent && (
                        <span className="absolute -top-7 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black uppercase tracking-widest border border-amber-200 shadow-lg shadow-amber-500/60 whitespace-nowrap z-30 flex items-center space-x-1 animate-pulse">
                          <span>📍</span>
                          <span>YOU ARE HERE</span>
                        </span>
                      )}

                      <div className={`rounded-full overflow-hidden border-2 transition-all duration-300 relative flex items-center justify-center bg-slate-900 ${
                        isCurrent 
                          ? 'w-14 h-14 sm:w-16 sm:h-16 border-amber-400 ring-4 ring-amber-400/70 shadow-[0_0_30px_rgba(245,158,11,0.85)] scale-110' 
                          : 'w-9 h-9 sm:w-10 sm:h-10 border-white/30 hover:border-amber-300 hover:scale-110 grayscale-[30%] hover:grayscale-0'
                      }`}>
                        <img 
                          src={cityImages[item.id]} 
                          alt={`${item.name} timeline node - ${item.id === 'krakow' ? "Rynek Główny Christmas Market" : "Christmas Market"}`} 
                          className="w-full h-full object-cover" 
                          loading="lazy"
                          decoding="async"
                        />
                        {isCurrent && (
                          <div className="absolute inset-0 bg-amber-400/20 ring-2 ring-amber-300 ring-inset"></div>
                        )}
                      </div>

                      <span className={`mt-1.5 tracking-tight ${
                        isCurrent 
                          ? 'text-amber-300 text-sm font-black drop-shadow-[0_2px_8px_rgba(245,158,11,0.7)] underline decoration-amber-400 decoration-2 underline-offset-4' 
                          : 'text-slate-400 text-xs font-bold group-hover:text-white'
                      }`}>
                        {item.name}
                      </span>
                    </a>

                    {/* Crisp Vector Train Badge Riding ON the Track */}
                    {!isLast && (
                      <div className="relative z-10 flex items-center justify-center shrink-0">
                        <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-amber-300 shadow-md shadow-amber-500/30 flex items-center space-x-1 font-black transform hover:scale-105 transition-all">
                          <Train className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
                          <span className="text-[9px] sm:text-[10px] font-black tracking-wider uppercase text-slate-950">TRAIN</span>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Sub-Header Toolbar (Opens Dedicated Sub-Pages & Stays Sticky at Top) */}
      <div className="sticky top-14 z-40 py-2.5 bg-slate-950/95 backdrop-blur-xl border-y border-amber-500/30 w-full shadow-xl">
        <div className="p-1.5 rounded-xl border border-amber-500/20 !bg-slate-900/90 shadow-md flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar no-overscroll-x">
          <a
            href={baseUrl}
            onClick={(e) => handleSubPageTabClick(e, baseUrl)}
            className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
              activeSubPage === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-wf-cream hover:text-white hover:bg-white/10'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Overview</span>
          </a>

          {city.historyEpochs && city.historyEpochs.length > 0 && (
            <a
              href={`${baseUrl}/history`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/history`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'history'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>History & Timeline</span>
            </a>
          )}

          {city.markets && city.markets.length > 0 && (
            <a
              href={`${baseUrl}/markets`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/markets`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'markets'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Christmas Markets</span>
            </a>
          )}

          {city.mustSee && city.mustSee.length > 0 && (
            <a
              href={`${baseUrl}/attractions`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/attractions`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'attractions'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Must-See Sights</span>
            </a>
          )}

          {city.restaurants && city.restaurants.length > 0 && (
            <a
              href={`${baseUrl}/restaurants`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/restaurants`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'restaurants'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Food & Drink</span>
            </a>
          )}

          <a
            href={`${baseUrl}/hotels`}
            onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/hotels`)}
            className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
              activeSubPage === 'hotels'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-wf-cream hover:text-white hover:bg-white/10'
            }`}
          >
            <Bed className="w-3.5 h-3.5" />
            <span>Lodging</span>
          </a>

          {city.lgbtq && (
            <a
              href={`${baseUrl}/lgbtq`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/lgbtq`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'lgbtq'
                  ? 'bg-purple-600 text-white shadow-sm font-bold ring-2 ring-purple-400/50'
                  : 'text-purple-300 hover:text-purple-100 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/30" />
              <span>LGBTQ+ Guide</span>
            </a>
          )}
        </div>
      </div>

      {/* 2-Column Split Hero Section: Left (High-level details & text), Right (Main Picture) */}
      {activeSubPage === 'lgbtq' && city.lgbtq ? (
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-purple-500/30 bg-wf-navy-mid/95 shadow-2xl flex flex-col lg:flex-row items-stretch gap-6">
          {/* Left Column: LGBTQ+ Specific Focus & Text */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
                  <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/40" />
                  <span>LGBTQ+ Traveler's Guide</span>
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-white/10 text-wf-cream text-xs font-medium">
                  {city.lgbtq.primaryArea?.split('(')[0]?.trim() || city.name}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white flex items-center space-x-3 tracking-tight">
                <Heart className="w-8 h-8 sm:w-10 sm:h-10 text-pink-400 fill-pink-400/30 shrink-0" />
                <span>LGBTQ+ {city.name}</span>
              </h1>

              <div className="space-y-1.5 pt-1">
                <div className="text-purple-300 text-xs font-bold uppercase tracking-widest">Queer Atmosphere & Culture</div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                  {city.lgbtq.subtitle}
                </p>
              </div>

              <div className="text-xs text-pink-400/90 font-semibold flex items-center space-x-1.5 pt-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{city.lgbtq.primaryArea || city.name}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center space-x-2">
              <span className="font-bold text-purple-300">Key Hub:</span>
              <span className="truncate">{city.lgbtq.landmark || city.name}</span>
            </div>
          </div>

          {/* Right Column: LGBTQ+ Photo */}
          <CityHeroImageCard
            imageSrc={city.lgbtq.imageUrl ? getAttractionImage(city.lgbtq.imageUrl, '', city.id) : cityImages[city.id]}
            alt={`LGBTQ+ ${city.name} - ${city.lgbtq.landmark || city.name}`}
            location={city.lgbtq.primaryArea || city.name}
            landmark={city.lgbtq.landmark || city.name}
            description={city.lgbtq.landmarkDescription || city.lgbtq.overview}
            isLgbtq={true}
            heightClass="h-64 sm:h-80"
          />
        </div>
      ) : (
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 shadow-2xl flex flex-col lg:flex-row items-stretch gap-6">
          {/* Left Column: High-Level Details & Text */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
                  <span>🎄</span>
                  <span>Christmas Market Destination</span>
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-white/10 text-wf-cream text-xs font-medium">
                  {city.nights > 0 ? `${city.nights} Nights` : 'Day Stop'}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white flex items-center space-x-3 tracking-tight">
                <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 shrink-0" />
                <span>{city.name}</span>
              </h1>

              <div className="space-y-1.5 pt-1">
                <div className="text-amber-300 text-xs font-bold uppercase tracking-widest">Trip Focus</div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                  {city.focus}
                </p>
              </div>

              {city.imageDetails?.location && (
                <div className="text-xs text-amber-400/90 font-semibold flex items-center space-x-1.5 pt-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{city.imageDetails.location}</span>
                </div>
              )}
            </div>

            {city.imageDetails?.landmark && (
              <div className="pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center space-x-2">
                <span className="font-bold text-amber-300">Key Landmark:</span>
                <span className="truncate">{city.imageDetails.landmark}</span>
              </div>
            )}
          </div>

          {/* Right Column: Main Picture */}
          <CityHeroImageCard
            imageSrc={cityImages[city.id]}
            alt={`${city.name} - ${city.id === 'krakow' ? "Rynek Główny Christmas Market" : city.name}`}
            location={city.imageDetails?.location}
            landmark={city.imageDetails?.landmark}
            description={city.imageDetails?.description}
            isLgbtq={false}
            heightClass="h-72 sm:h-96"
          />
        </div>
      )}



      {/* RENDER DEDICATED SUB-PAGE CONTENT */}
      <div ref={subPageSectionRef} className="space-y-8">
        {/* 1. OVERVIEW SUB-PAGE (Main Page) */}
        {activeSubPage === 'overview' && (
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {city.historyEpochs && city.historyEpochs.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
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
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>View Timeline Tab</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            )}

            {city.mustSee && city.mustSee.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
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
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>View All Sights</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            )}

            {city.restaurants && city.restaurants.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
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
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start"
                >
                  <Utensils className="w-4 h-4" />
                  <span>View Food & Drink</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            )}
          </div>

          {/* Transit & Interactive City Map */}
          <section className="space-y-6">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-5 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-2">
                  <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
                    <Thermometer className="w-5 h-5" />
                    <span>December Weather & Gear</span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed"><FormatText text={city.practical.weather} /></p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
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
                        <span className="font-bold text-amber-200">20-30 PLN (~<FormatCurrency pln={20} />–<FormatCurrency pln={30} />)</span>
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
      )}

      {/* 2. CHRONOLOGICAL HISTORY SUB-PAGE */}
      {activeSubPage === 'history' && city.history && (
        <div id="chronological-history-section" className="space-y-8 animate-fade-in scroll-mt-32">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-black text-white flex items-center space-x-3">
              <BookOpen className="w-7 h-7 text-amber-400" />
              <span>Chronological History & Heritage of {city.name}</span>
            </h2>
            <span className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider">
              1,000+ Years Living Timeline
            </span>
          </div>

          <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 relative overflow-hidden shadow-2xl space-y-6">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

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

            {/* Narrative Overview */}
            <p className="text-wf-cream text-sm sm:text-base md:text-lg leading-relaxed font-medium">
              {city.history}
            </p>
          </div>

          {/* Chronological Historical Epochs Timeline */}
          {city.historyEpochs && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                  <BookOpen className="w-5 h-5" />
                  <span>Chronological Journey Through Time</span>
                </div>

                {/* Filterable Era Tabs */}
                <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar no-overscroll-x py-1">
                  <button
                    onClick={() => setActiveEpochTab('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                      activeEpochTab === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                        : 'bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-amber-400/40'
                    }`}
                  >
                    All Historical Eras ({city.historyEpochs.length})
                  </button>
                  {city.historyEpochs.map((epoch, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveEpochTab(idx)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        activeEpochTab === idx
                          ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                          : 'bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-amber-400/40'
                      }`}
                    >
                      {epoch.era}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {city.historyEpochs
                  .filter((_, idx) => activeEpochTab === 'all' || activeEpochTab === idx)
                  .map((epoch) => {
                    const originalIdx = city.historyEpochs.indexOf(epoch);
                    return (
                      <div 
                        key={originalIdx} 
                        className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 hover:border-amber-400 bg-wf-navy/90 backdrop-blur-md transition-all group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center space-x-3">
                            <span className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-300 font-black text-sm flex items-center justify-center border border-amber-400/40 shrink-0">
                              {originalIdx + 1}
                            </span>
                            <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-amber-300 transition-colors">
                              {epoch.title}
                            </h3>
                          </div>
                          <span className="inline-block px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-400 text-xs font-black self-start sm:self-auto shrink-0">
                            {epoch.era}
                          </span>
                        </div>

                        {epoch.subtitle && (
                          <div className="text-xs sm:text-sm font-semibold text-amber-200/90 mb-2 pl-11">
                            {epoch.subtitle}
                          </div>
                        )}

                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed pl-11">
                          {epoch.description}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Living Folklore & Cultural Traditions */}
          {city.historyLegends && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                <Sparkles className="w-5 h-5" />
                <span>Living Folklore & Cultural Traditions</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {city.historyLegends.map((legend, idx) => (
                  <div 
                    key={idx} 
                    className="glass-panel p-5 sm:p-6 rounded-2xl border border-amber-500/20 hover:border-amber-400/50 bg-wf-navy/90 flex flex-col justify-between transition-all"
                  >
                    <div>
                      <div className="text-2xl mb-2.5">{legend.icon}</div>
                      <h4 className="text-sm sm:text-base font-black text-white mb-2 leading-snug">
                        {legend.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                        {legend.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. CHRISTMAS MARKETS SUB-PAGE */}
      {activeSubPage === 'markets' && city.markets && (
        <div id="markets-section" className="space-y-6 animate-fade-in scroll-mt-32">
          {/* Quick Reference Stats Bar */}
          <QuickReferenceBar city={city} />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-1">
                <Sparkles className="w-4 h-4" />
                <span>Dedicated Market Guide</span>
              </div>
              <h2 className="text-3xl font-black text-white">Christmas Markets in {city.name}</h2>
            </div>

            {/* Compact Embedded 4K Walking Tour Mini-Player */}
            {(() => {
              const videoId = city.id === 'krakow' ? 'DUFYxovB_80' : (city.id === 'wroclaw' ? 'lZfJ3H5kL50' : null);
              if (!videoId) return null;
              return (
                <div className="w-44 sm:w-48 md:w-52 shrink-0 rounded-xl overflow-hidden border border-amber-500/30 bg-slate-950 shadow-lg shadow-amber-950/30 group">
                  <div className="relative w-full aspect-video">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                      title={`4K ${city.name} Christmas Market Walking Tour`}
                      className="absolute inset-0 w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    ></iframe>
                  </div>
                  <div className="px-2.5 py-1 bg-wf-navy-mid/95 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                      <Video className="w-3 h-3 text-red-400" />
                      <span>4K Walking Tour</span>
                    </span>
                    <a
                      href={`https://www.youtube.com/watch?v=${videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-slate-400 hover:text-white flex items-center space-x-1 transition-colors"
                      title="Open on YouTube"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Sticky Sub-Tabs for individual markets */}
          <div className="sticky top-[118px] z-30 py-2 px-3 sm:px-4 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-emerald-500/30 shadow-2xl transition-all w-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Distinct Section Label */}
              <div className="flex items-center space-x-1.5 shrink-0 text-amber-400 font-black text-[11px] sm:text-xs uppercase tracking-wider px-1">
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                <span>Explore Markets:</span>
              </div>

              {/* Compact Responsive Pill Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setActiveMarketTab('all')}
                  className={`px-2.5 py-1 rounded-xl font-black text-[11px] sm:text-xs transition-all duration-200 flex items-center space-x-1 whitespace-nowrap shrink-0 border cursor-pointer ${
                    activeMarketTab === 'all'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
                  }`}
                >
                  <span>✨</span>
                  <span>All ({city.markets.length})</span>
                </button>

                {city.markets.map((market, idx) => {
                  const isActive = activeMarketTab === idx;
                  const label = market.shortName || market.name.replace(' Main Market', '').replace(' Craft Corner', '').replace(' Fair', '').replace(' Market', '');
                  return (
                    <button
                      key={market.id}
                      type="button"
                      onClick={() => setActiveMarketTab(idx)}
                      className={`px-2.5 py-1 rounded-xl font-bold text-[11px] sm:text-xs transition-all duration-200 flex items-center space-x-1 whitespace-nowrap shrink-0 border cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30 font-black'
                          : 'bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-100 border-emerald-500/40 hover:border-amber-400/60 shadow-sm'
                      }`}
                    >
                      <span>{isActive ? '🎄' : '⛺'}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 1. All Markets Grid View (When 'all' is selected) */}
          {activeMarketTab === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
              {city.markets.map((market) => {
                const marketImg = marketImages[market.id];
                const mapSearchQuery = encodeURIComponent(`${market.name}, ${market.address || market.location}, ${city.name}, Poland`);
                const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
                const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
                const isSaved = savedItems.has(market.id);

                return (
                  <article
                    key={market.id}
                    className="glass-panel rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 overflow-hidden shadow-xl flex flex-col justify-between group hover:border-amber-400/60 transition-all duration-300"
                  >
                    <div>
                      {/* Image Header */}
                      <div className="relative w-full h-64 sm:h-72 bg-slate-950 overflow-hidden shrink-0">
                        {marketImg ? (
                          <img
                            src={marketImg}
                            alt={market.name}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-900 to-amber-950/40 flex items-center justify-center">
                            <ShoppingBag className="w-12 h-12 text-amber-400/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-transparent to-black/40 pointer-events-none" />

                        {/* Location & Vibe Badges */}
                        <div className="absolute top-3.5 left-3.5 right-3.5 z-10 flex flex-wrap items-center justify-between gap-1.5">
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-950/80 backdrop-blur-md border border-amber-400/30 text-amber-300 shadow-md truncate">
                            📍 {market.location}
                          </span>
                          {market.vibe && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 backdrop-blur-md border border-emerald-400/40 text-emerald-300 shadow-md">
                              ✨ {market.vibe}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-5 sm:p-6 space-y-4">
                        <div className="space-y-1">
                          <h3 className="text-xl font-black text-white group-hover:text-amber-300 transition-colors leading-tight">
                            {market.name}
                          </h3>
                          {market.address && (
                            <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold">
                              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="truncate">{market.address}</span>
                            </div>
                          )}
                        </div>

                        {/* Operating Hours Bar */}
                        {market.hours && (
                          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 flex items-center space-x-2 text-xs">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-slate-300 font-medium truncate">{market.hours}</span>
                          </div>
                        )}

                        {/* Best Time to Visit callout */}
                        {market.bestTime && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center space-x-2">
                            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            <span className="text-amber-200 font-semibold leading-snug">Best Time: {market.bestTime}</span>
                          </div>
                        )}

                        {/* Key Highlights List */}
                        {market.highlights && market.highlights.length > 0 && (
                          <div className="p-3 rounded-2xl bg-wf-navy-mid/90 border border-white/10 space-y-1.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                              ✦ Key Highlights & Features:
                            </span>
                            <ul className="space-y-1 text-xs text-slate-300">
                              {market.highlights.slice(0, 3).map((item, idx) => (
                                <li key={idx} className="flex items-start space-x-1.5">
                                  <span className="text-amber-400 font-bold">•</span>
                                  <span className="leading-snug">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Must-Try Quick Tags */}
                        {market.mustTry && (
                          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                              🍢 Must-Try Fares:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {market.mustTry.map((food, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-200 text-[11px] font-semibold">
                                  {food}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 flex items-center justify-between gap-2 shrink-0">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleItinerary(market.id);
                          }}
                          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer ${
                            isSaved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                          }`}
                          title={isSaved ? 'Saved in Itinerary' : 'Add to Itinerary'}
                        >
                          {isSaved ? (
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
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                        title={`Get Directions to ${market.name}`}
                      >
                        <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                        <span className="truncate">Directions</span>
                      </a>

                      <a
                        href={mapSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                        title={`View ${market.name} on Map`}
                      >
                        <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                        <span className="truncate">View Map</span>
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* 2. Active Market Deep-Dive Details Card (When individual index is selected) */}
          {activeMarketTab !== 'all' && city.markets[activeMarketTab] && (() => {
            const currentMarket = city.markets[activeMarketTab];
            const marketImg = marketImages[currentMarket.id];
            const mapSearchQuery = encodeURIComponent(`${currentMarket.name}, ${currentMarket.address || currentMarket.location}, ${city.name}, Poland`);
            const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
            const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
            const isSaved = savedItems.has(currentMarket.id);

            return (
              <div className="glass-panel rounded-3xl border border-amber-500/30 overflow-hidden shadow-2xl bg-amber-500/5 space-y-6 animate-fade-in">
                {/* Market Specific Picture Header */}
                {marketImg && (
                  <div className="w-full h-72 sm:h-96 relative overflow-hidden group bg-slate-950">
                    <img 
                      src={marketImg} 
                      alt={currentMarket.name} 
                      className="w-full h-full object-cover object-center transition-transform duration-1000 group-hover:scale-105" 
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/40 to-transparent"></div>
                    <div className="absolute bottom-6 left-6 right-6 flex flex-col items-start gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                          📍 {currentMarket.location}
                        </span>
                        {currentMarket.vibe && (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                            ✨ {currentMarket.vibe}
                          </span>
                        )}
                      </div>
                      <h3 className="text-3xl sm:text-4xl font-black text-white drop-shadow-md">
                        {currentMarket.name}
                      </h3>
                    </div>
                  </div>
                )}

                <div className="p-6 sm:p-8 space-y-6">
                  {/* Hours & Address quick bar */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {currentMarket.hours && (
                      <div className="p-4 rounded-2xl bg-wf-navy-mid/90 border border-amber-500/20 flex items-start space-x-3">
                        <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block mb-0.5">Operating Hours</span>
                          <span className="text-sm font-semibold text-white">{currentMarket.hours}</span>
                        </div>
                      </div>
                    )}

                    {currentMarket.address && (
                      <div className="p-4 rounded-2xl bg-wf-navy-mid/90 border border-amber-500/20 flex items-start space-x-3">
                        <Navigation className="w-5 h-5 text-wf-blue-lt shrink-0 mt-0.5" />
                        <div>
                          <span className="text-wf-blue-lt text-xs font-bold uppercase tracking-wider block mb-0.5">Location & Transit</span>
                          <span className="text-sm font-medium text-wf-cream">{currentMarket.address}</span>
                        </div>
                      </div>
                    )}

                    {currentMarket.bestTime && (
                      <div className="p-4 rounded-2xl bg-wf-navy-mid/90 border border-emerald-500/20 flex items-start space-x-3">
                        <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider block mb-0.5">Best Time to Visit</span>
                          <span className="text-sm font-semibold text-white">{currentMarket.bestTime}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Primary Specialty & Atmosphere */}
                  <div className="p-5 rounded-2xl bg-wf-navy-mid/80 border border-white/5 space-y-3">
                    <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block">⭐ Specialties & Atmosphere</span>
                    <p className="text-white font-bold text-base sm:text-lg leading-snug">
                      {currentMarket.specialty}
                    </p>
                    <p className="text-wf-cream text-sm sm:text-base leading-relaxed">
                      {currentMarket.details}
                    </p>
                  </div>

                  {/* Comprehensive Highlights Breakdown */}
                  {currentMarket.highlights && currentMarket.highlights.length > 0 && (
                    <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
                      <span className="text-amber-300 text-xs font-extrabold uppercase tracking-wider block flex items-center space-x-2">
                        <Compass className="w-4 h-4 text-amber-400" />
                        <span>Key Market Highlights & Unique Experiences</span>
                      </span>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs sm:text-sm text-slate-200">
                        {currentMarket.highlights.map((h, i) => (
                          <li key={i} className="flex items-start space-x-2 bg-slate-950/60 p-3 rounded-xl border border-white/5">
                            <span className="text-amber-400 font-bold">✦</span>
                            <span className="font-medium leading-snug">{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Must-Try & Souvenirs Grids */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {currentMarket.mustTry && (
                      <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <h4 className="text-amber-300 font-bold text-sm uppercase tracking-wider mb-3 flex items-center space-x-2">
                          <Utensils className="w-4 h-4 text-amber-400" />
                          <span>Must-Try Food & Drinks</span>
                        </h4>
                        <ul className="space-y-2">
                          {currentMarket.mustTry.map((item, i) => (
                            <li key={i} className="text-sm text-wf-cream flex items-center space-x-2">
                              <span className="text-amber-400 text-xs">🍢</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {currentMarket.souvenirs && (
                      <div className="p-5 rounded-2xl bg-wf-blue-lt/10 border border-wf-blue-lt/20">
                        <h4 className="text-wf-blue-lt font-bold text-sm uppercase tracking-wider mb-3 flex items-center space-x-2">
                          <Gift className="w-4 h-4 text-wf-blue-lt" />
                          <span>Top Souvenirs & Crafts</span>
                        </h4>
                        <ul className="space-y-2">
                          {currentMarket.souvenirs.map((item, i) => (
                            <li key={i} className="text-sm text-wf-cream flex items-center space-x-2">
                              <span className="text-wf-blue-lt text-xs">🎁</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* UNESCO Cultural Tradition Callout */}
                  {currentMarket.unescoTradition && (
                    <div className="p-4.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-start space-x-3 shadow-lg shadow-amber-950/20">
                      <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block mb-0.5">🏆 UNESCO Heritage Tradition</span>
                        <p className="text-xs sm:text-sm text-amber-100 font-medium leading-relaxed">{currentMarket.unescoTradition}</p>
                      </div>
                    </div>
                  )}

                  {/* Insider Tips Callout */}
                  {currentMarket.tips && (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-3">
                      <Lightbulb className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider block mb-0.5">💡 Helpful Insider Tip</span>
                        <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed">{currentMarket.tips}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Market Card Action Bar (Directions, Add to Itinerary, View Map) */}
                <div className="bg-slate-950/90 border-t border-white/10 p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => toggleItinerary(currentMarket.id)}
                      className={`flex-1 min-w-[150px] py-3 px-4 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 border cursor-pointer ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-lg shadow-emerald-950/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50 shadow-lg'
                      }`}
                      title={isSaved ? 'Saved in Itinerary' : 'Add to Itinerary'}
                    >
                      {isSaved ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Saved in Itinerary</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Add to Itinerary</span>
                        </>
                      )}
                    </button>
                  )}

                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[150px] py-3 px-4 rounded-2xl bg-white/5 hover:bg-sky-500/20 text-slate-200 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 group/btn shadow-lg"
                    title={`Get Google Maps Directions to ${currentMarket.name}`}
                  >
                    <Navigation className="w-4 h-4 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                    <span>Directions</span>
                  </a>

                  <a
                    href={mapSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[150px] py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 group/btn shadow-lg"
                    title={`View ${currentMarket.name} on Map`}
                  >
                    <Compass className="w-4 h-4 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                    <span>View Map</span>
                  </a>
                </div>
              </div>
            );
          })()}


        </div>
      )}

      {/* 3. MUST-SEE ATTRACTIONS SUB-PAGE */}
      {activeSubPage === 'attractions' && city.mustSee && (
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
      )}

      {/* 4. FOOD & DRINK SUB-PAGE */}
      {activeSubPage === 'restaurants' && (city[`${city.id}RestaurantsDetailed`] || city[`${city.id}DrinksDetailed`] || city.restaurants) && (
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
          {(city[`${city.id}RestaurantsDetailed`] || city[`${city.id}DrinksDetailed`]) && (
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
          {(city[`${city.id}RestaurantsDetailed`] || city[`${city.id}DrinksDetailed`] || city[`${city.id}CafesDetailed`]) ? (
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
                              setSavedItems(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(item.id)) newSet.delete(item.id);
                                else newSet.add(item.id);
                                return newSet;
                              });
                            }}
                            className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
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
      )}

      {/* 5. BASE & HOTELS SUB-PAGE */}
      {activeSubPage === 'hotels' && (
        <div id="hotels-section" className="space-y-4 animate-fade-in scroll-mt-32">
          {/* Header Banner */}
          <div className="glass-panel p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-amber-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-amber-500/15 via-emerald-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-sm">
                  <Bed className="w-3.5 h-3.5" />
                  <span>Curated Accommodations</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
                  Recommended Lodging in {city.name}
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 font-medium leading-tight">
                Strategic hotels selected for proximity to the Christmas Markets, walking distance to historic landmarks, and winter comfort.
              </p>
              <div className="pt-0.5 flex items-center space-x-1.5 text-[11px] sm:text-xs font-bold text-emerald-300">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Recommended Base Area: <span className="text-white underline decoration-emerald-400/50 underline-offset-2">{city.base}</span></span>
              </div>
            </div>
          </div>

          {/* Sticky Tier Filter Bar (Stays in view while scrolling hotels) */}
          {city[`${city.id}HotelsDetailed`] && (
            <div className="sticky top-[118px] z-30 py-3 px-4 sm:px-6 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-amber-500/30 shadow-2xl transition-all">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHotelTierFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      hotelTierFilter === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                    }`}
                  >
                    All Options ({city[`${city.id}HotelsDetailed`].length + (city[`${city.id}UniqueStays`]?.length || 0)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHotelTierFilter('luxury')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
                      hotelTierFilter === 'luxury'
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Luxury ({city[`${city.id}HotelsDetailed`].filter((h) => h.tier === 'luxury').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHotelTierFilter('mid')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
                      hotelTierFilter === 'mid'
                        ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                        : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Mid-Range ({city[`${city.id}HotelsDetailed`].filter((h) => h.tier === 'mid').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHotelTierFilter('budget')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
                      hotelTierFilter === 'budget'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Cost-Effective ({city[`${city.id}HotelsDetailed`].filter((h) => h.tier === 'budget').length})</span>
                  </button>
                  {city[`${city.id}UniqueStays`] && city[`${city.id}UniqueStays`].length > 0 && (
                    <button
                      type="button"
                      onClick={() => setHotelTierFilter('unique')}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
                        hotelTierFilter === 'unique'
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/20 border border-transparent'
                          : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>UNIQUE STAYS ({city[`${city.id}UniqueStays`].length})</span>
                    </button>
                  )}
                </div>
                <div className="text-xs font-bold text-slate-400 flex items-center space-x-1">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>Proximity metrics included for all top markets</span>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Hotel Cards Grid */}
          {city[`${city.id}HotelsDetailed`] ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {city[`${city.id}HotelsDetailed`]
                .filter((h) => hotelTierFilter === 'all' || h.tier === hotelTierFilter)
                .map((hotel) => {
                  const isLuxury = hotel.tier === 'luxury';
                  const isMid = hotel.tier === 'mid';
                  const isBudget = hotel.tier === 'budget';

                  const badgeStyle = isLuxury
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-300'
                    : isMid
                    ? 'bg-purple-500/20 text-purple-300 border-purple-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';

                  const borderStyle = isLuxury
                    ? 'border-amber-500/30 hover:border-amber-400/60'
                    : isMid
                    ? 'border-purple-500/30 hover:border-purple-400/60'
                    : 'border-emerald-500/30 hover:border-emerald-400/60';

                  const displayPrice = hotel.basePricePln;

                  const mapSearchQuery = encodeURIComponent(`${hotel.name}, ${city.name}, Poland`);
                  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
                  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;

                  return (
                    <article
                      key={hotel.id}
                      className={`glass-panel rounded-3xl border ${borderStyle} bg-wf-navy-mid/90 overflow-hidden shadow-xl transition-all duration-300 flex flex-col justify-between group`}
                    >
                      <div>
                        {/* Hotel Header Image */}
                        <div className="relative w-full h-48 bg-slate-950 overflow-hidden shrink-0">
                          <img
                            src={hotel.imageSrc}
                            alt={hotel.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = cityImages[city.id] || cityImages.krakow;
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-transparent to-black/40 pointer-events-none" />

                          {/* Floating Category Pill */}
                          <div className="absolute top-3.5 left-3.5 z-10 flex items-center space-x-2">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border backdrop-blur-md shadow-md ${badgeStyle}`}>
                              {hotel.tierLabel}
                            </span>
                          </div>

                          {/* Star Rating */}
                          <div className="absolute top-3.5 right-3.5 z-10 bg-slate-950/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10 flex items-center space-x-1 text-amber-300 text-xs font-bold shadow-md">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{hotel.stars}-Star</span>
                          </div>
                        </div>

                        {/* Hotel Body Details */}
                        <div className="p-5 sm:p-6 space-y-4">
                          <div className="space-y-1">
                            <h3 className="text-xl font-black text-white group-hover:text-amber-300 transition-colors leading-tight">
                              {hotel.name}
                            </h3>
                            <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold">
                              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>{hotel.neighborhood}</span>
                            </div>
                          </div>

                          {/* Live Average Pricing Box */}
                          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                                <span>Live Average / Night</span>
                              </div>
                            </div>
                            <div className="flex items-baseline">
                              <span className="text-2xl font-black text-white">{displayPrice} PLN</span>
                              <span className="text-xs text-slate-400 ml-1.5 font-semibold">(~<FormatCurrency pln={displayPrice} />)</span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed font-medium">
                            {hotel.description}
                          </p>

                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-200">
                            ✨ <span className="font-bold text-amber-300">Highlight:</span> {hotel.signatureFeature}
                          </div>

                          {/* Proximity Breakdown to Top Christmas Markets */}
                          <div className="pt-2 border-t border-white/10 space-y-2">
                            <div className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                              <Compass className="w-3.5 h-3.5" />
                              <span>Distance to Top Christmas Markets</span>
                            </div>

                            <div className="grid grid-cols-1 gap-1.5 text-xs font-medium">
                              {hotel.proximity.rynekMarket && (
                                <div className="flex items-start space-x-2">
                                    <MapPin className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                                    <span className="text-amber-200 font-semibold">{hotel.proximity.rynekMarket.name}</span>
                                    <span className="text-slate-400 ml-auto whitespace-nowrap font-mono text-[11px] bg-slate-900/50 px-2 py-0.5 rounded border border-white/5 font-semibold">
                                      <FormatDistance val={hotel.proximity.rynekMarket.distance} /> ({hotel.proximity.rynekMarket.time})
                                    </span>
                                  </div>
                              )}
                              {hotel.proximity.malyRynekMarket && (
                                <div className="flex items-start space-x-2">
                                    <MapPin className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                                    <span className="text-amber-100/70">{hotel.proximity.malyRynekMarket.name}</span>
                                    <span className="text-slate-500 ml-auto whitespace-nowrap font-mono text-[11px]">
                                      <FormatDistance val={hotel.proximity.malyRynekMarket.distance} /> ({hotel.proximity.malyRynekMarket.time})
                                    </span>
                                  </div>
                              )}
                              {hotel.proximity.kazimierzMarket && (
                                <div className="flex items-start space-x-2">
                                    <MapPin className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                                    <span className="text-amber-100/70">{hotel.proximity.kazimierzMarket.name}</span>
                                    <span className="text-slate-500 ml-auto whitespace-nowrap font-mono text-[11px]">
                                      <FormatDistance val={hotel.proximity.kazimierzMarket.distance} /> ({hotel.proximity.kazimierzMarket.time})
                                    </span>
                                  </div>
                              )}
                            </div>
                          </div>

                          {/* Proximity to Top Attractions */}
                          {hotel.proximity?.attractions && hotel.proximity.attractions.length > 0 && (
                            <div className="pt-2 border-t border-white/10 space-y-2">
                              <div className="text-xs font-black text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
                                <Landmark className="w-3.5 h-3.5" />
                                <span>Top Landmark Distances</span>
                              </div>

                              <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                                {hotel.proximity.attractions.map((att, aIdx) => (
                                  <div key={aIdx} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                                    <span className="text-slate-300 truncate pr-2">{att.name}</span>
                                    <span className="text-sky-300 font-mono text-[10px] font-bold"><FormatDistance val={att.distance} /> ({att.time})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Amenities Tags */}
                          {hotel.amenities && hotel.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {hotel.amenities.map((am, amIdx) => (
                                <span key={amIdx} className="px-2 py-0.5 rounded-md bg-slate-900 border border-white/10 text-[10px] font-bold text-slate-300">
                                  • {am}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Action Footer */}
                      <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 flex items-center justify-between gap-2 shrink-0">
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                        >
                          <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-amber-300" />
                          <span>Directions</span>
                        </a>

                        <a
                          href={hotel.websiteUrl || mapSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                        >
                          {hotel.websiteUrl ? <ExternalLink className="w-3.5 h-3.5" /> : <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300" />}
                          <span>{hotel.websiteUrl ? 'Website' : 'View Map'}</span>
                        </a>

                        {isAuthenticated && (
                          <button
                            onClick={() => toggleItinerary(hotel.id)}
                            className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                              savedItems.has(hotel.id)
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-white/5 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 border-white/10 hover:border-emerald-500/40'
                            }`}
                          >
                            {savedItems.has(hotel.id) ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Itinerary</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          ) : (
            <div className="glass-panel border-wf-evergreen/30 p-8 rounded-3xl bg-wf-evergreen/5">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center space-x-3">
                <Bed className="w-6 h-6 text-wf-evergreen" />
                <span>Recommended Lodging in {city.name}</span>
              </h3>
              <p className="text-wf-cream font-semibold text-lg mb-4">{city.base}</p>
              {city.hotels.length > 0 && (
                <ul className="space-y-3">
                  {city.hotels.map((hotel, idx) => (
                    <li key={idx} className="text-sm text-wf-cream flex items-start space-x-2">
                      <span className="text-wf-evergreen font-bold">•</span>
                      <span>{hotel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Unique Stays Section */}
          {(hotelTierFilter === 'all' || hotelTierFilter === 'unique') && city[`${city.id}UniqueStays`] && city[`${city.id}UniqueStays`].length > 0 && (
            <div className="space-y-4">
              <div className="glass-panel p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-purple-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-purple-500/15 via-pink-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
                <div className="relative z-10 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-sm">
                      <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                      <span>Unique Stays</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
                      Beyond the Ordinary in {city.name}
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium leading-tight">
                    Unconventional, memorable, and one-of-a-kind accommodations - from UNESCO salt mines to communist-era icons and monastic retreats.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {city[`${city.id}UniqueStays`].map((stay) => (
                  <article
                    key={stay.id}
                    className="glass-panel rounded-2xl border border-purple-500/20 hover:border-purple-400/50 bg-wf-navy-mid/90 overflow-hidden shadow-xl transition-all duration-300 flex flex-col justify-between group"
                  >
                    <div className="relative w-full h-44 bg-slate-950 overflow-hidden shrink-0">
                      <img
                        src={stay.imageSrc}
                        alt={stay.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = cityImages[city.id] || cityImages.krakow;
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-transparent to-black/30 pointer-events-none" />
                      <div className="absolute top-3 left-3 z-10">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border backdrop-blur-md shadow-md bg-purple-500/30 border-purple-400/50 text-purple-200">{stay.typeLabel}</span>
                      </div>
                      <div className="absolute top-3 right-3 z-10 bg-slate-950/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-purple-500/30 text-purple-300 text-[10px] font-bold shadow-md">{stay.vibe}</div>
                    </div>
                    <div className="p-4 sm:p-5 space-y-3 flex-1">
                      <div className="space-y-0.5">
                        <h3 className="text-base font-black text-white group-hover:text-purple-300 transition-colors leading-tight">{stay.name}</h3>
                        <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>{stay.neighborhood}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-purple-500/20">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Est. Price / Night</span>
                        <div className="text-right">
                          <span className="text-sm font-black text-white">{stay.priceRange}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5 font-semibold">({stay.priceUsd})</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">{stay.description}</p>
                      <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs font-semibold text-purple-200">
                        <span className="mr-1">&#10024;</span><span className="font-bold text-purple-300">Why it is unique:</span> {stay.whyUnique}
                      </div>
                      {stay.bestFor && (
                        <div className="flex flex-wrap gap-1.5">
                          {stay.bestFor.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-md bg-slate-900 border border-purple-500/20 text-[10px] font-bold text-purple-300">{tag}</span>
                          ))}
                        </div>
                      )}
                      {stay.travelNote && (
                        <div className="flex items-start space-x-1.5 text-[11px] text-slate-400 font-medium">
                          <Navigation className="w-3 h-3 text-sky-400 shrink-0 mt-0.5" />
                          <span>{stay.travelNote}</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 flex items-center gap-2 shrink-0">
                      <a href={stay.bookingUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 px-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/25 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-400/60 text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Book / Explore</span>
                      </a>
                      {isAuthenticated && (
                        <button
                          onClick={() => toggleItinerary(stay.id)}
                          className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 border ${savedItems.has(stay.id) ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-white/5 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 border-white/10 hover:border-emerald-500/40'}`}
                        >
                          {savedItems.has(stay.id)
                            ? <><CheckCircle2 className="w-3.5 h-3.5" /><span>Saved</span></>
                            : <><Plus className="w-3.5 h-3.5 text-emerald-400" /><span>Itinerary</span></>
                          }
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. LGBTQ+ GUIDE SUB-PAGE */}
      {activeSubPage === 'lgbtq' && city.lgbtq && (
        <div id="lgbtq-section" className="space-y-10 animate-fade-in scroll-mt-32">
          {/* Header Banner */}
          <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-purple-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-2xl space-y-6">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-purple-500/20 via-pink-500/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-black uppercase tracking-wider shadow-sm">
                  <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/40" />
                  <span>LGBTQ+ Traveler's Guide</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {city.lgbtq.title}
                </h2>
                <p className="text-sm sm:text-base text-purple-200/90 font-medium leading-relaxed">
                  {city.lgbtq.subtitle}
                </p>
              </div>

              {city.lgbtq.imageUrl && (
                <div className="w-full md:w-80 h-48 rounded-2xl overflow-hidden border border-purple-500/30 shadow-xl shrink-0 relative group">
                  <img
                    src={getAttractionImage(city.lgbtq.imageUrl)}
                    alt={`LGBTQ+ ${city.name} - ${city.lgbtq.landmark || city.name}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent"></div>
                  <div className="absolute bottom-2.5 left-3 text-[11px] font-bold text-white flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-pink-400" />
                    <span>{city.lgbtq.landmark || city.name}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Overview Narrative */}
            <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-2 relative z-10">
              <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center space-x-1.5">
                <Heart className="w-4 h-4 text-pink-400 fill-pink-400/40" />
                <span>Culture, Atmosphere & Community</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                {city.lgbtq.overview}
              </p>
            </div>

            {/* Safety & Legal Context Card */}
            {city.lgbtq.safetyAndLegal && (
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-slate-950/90 to-purple-950/40 border border-purple-500/30 space-y-4 relative z-10 shadow-lg">
                <div className="flex items-center space-x-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Safety, Laws & Traveler Practicalities</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                      <span>⚖️ Legal Equality & History</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {city.lgbtq.safetyAndLegal.legalContext}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1.5">
                    <div className="font-bold text-sky-300 flex items-center space-x-1.5">
                      <span>🤝 Public Displays of Affection (PDA) & Safety</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {city.lgbtq.safetyAndLegal.pdaAdvice}
                    </p>
                  </div>
                </div>

                {city.lgbtq.safetyAndLegal.helplines && (
                  <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center space-x-1">
                      <Phone className="w-3.5 h-3.5" />
                      <span>Community Resources:</span>
                    </span>
                    {city.lgbtq.safetyAndLegal.helplines.map((hl, hIdx) => (
                      <div key={hIdx} className="px-3 py-1 rounded-lg bg-purple-900/40 border border-purple-500/30 text-[11px] text-slate-200">
                        <span className="font-bold text-pink-300">{hl.name}:</span> <span className="text-slate-300">{hl.contact}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky Category Filter Toolbar */}
          <div className="sticky top-[118px] z-30 py-3 px-4 sm:px-6 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-purple-500/30 shadow-2xl transition-all">
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar no-overscroll-x">
              <button
                type="button"
                onClick={() => setLgbtqCategoryFilter('all')}
                className={`px-4 py-3 sm:py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer min-h-[44px] sm:min-h-0 ${
                  lgbtqCategoryFilter === 'all'
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                All Sections
              </button>
              {city.lgbtq.neighborhoods && city.lgbtq.neighborhoods.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLgbtqCategoryFilter('neighborhoods')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                    lgbtqCategoryFilter === 'neighborhoods'
                      ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                      : 'bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Neighborhoods</span>
                </button>
              )}
              {city.lgbtq.barsAndClubs && city.lgbtq.barsAndClubs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLgbtqCategoryFilter('nightlife')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                    lgbtqCategoryFilter === 'nightlife'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                      : 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border border-purple-600/30'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Nightlife & Bars</span>
                </button>
              )}
              {city.lgbtq.cafesAndDining && city.lgbtq.cafesAndDining.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLgbtqCategoryFilter('dining')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                    lgbtqCategoryFilter === 'dining'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Cafés & Dining</span>
                </button>
              )}
              {city.lgbtq.communityAndCulture && city.lgbtq.communityAndCulture.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLgbtqCategoryFilter('community')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                    lgbtqCategoryFilter === 'community'
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Culture & Community</span>
                </button>
              )}
              {city.lgbtq.winterExperiences && city.lgbtq.winterExperiences.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLgbtqCategoryFilter('winter')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                    lgbtqCategoryFilter === 'winter'
                      ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                      : 'bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Winter Experiences</span>
                </button>
              )}
            </div>
          </div>

          {/* 1. Key Districts & Queer Geography */}
          {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'neighborhoods') && city.lgbtq.neighborhoods && city.lgbtq.neighborhoods.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-pink-400 font-black text-xs uppercase tracking-wider">
                <Compass className="w-4 h-4" />
                <span>Queer Districts & Enclaves</span>
              </div>
              <h3 className="text-2xl font-black text-white">Neighborhoods & Iconic Hubs</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {city.lgbtq.neighborhoods.map((area, idx) => {
                  const mapSearchQuery = encodeURIComponent(`${area.name}, ${city.name}, Poland`);
                  const areaId = area.id || `lgbtq-neighborhood-${idx}`;
                  const isSaved = savedItems.has(areaId);

                  return (
                  <div key={idx} className="glass-panel rounded-3xl border border-pink-500/30 bg-wf-navy-mid/90 hover:border-pink-400/60 transition-all flex flex-col justify-between shadow-xl overflow-hidden">
                    <div className="p-6 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-lg font-black text-white">{area.name}</h4>
                      </div>
                      <div className="text-xs font-semibold text-pink-300">✨ {area.vibe}</div>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                        {area.description}
                      </p>
                    </div>
                    {/* Action Footer */}
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleItinerary(areaId);
                          }}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                            isSaved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                          }`}
                        >
                          {isSaved ? (
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
                        href={area.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                        <span className="truncate">Visit Website</span>
                      </a>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. Gay Clubs & Bars */}
          {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'nightlife') && city.lgbtq.barsAndClubs && city.lgbtq.barsAndClubs.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-purple-400 font-black text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Nightlife & Social Venues</span>
              </div>
              <h3 className="text-2xl font-black text-white">Gay Clubs & Queer-Friendly Bars</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {city.lgbtq.barsAndClubs.map((venue, idx) => {
                  const mapSearchQuery = encodeURIComponent(`${venue.name}, ${venue.address || ''}, ${city.name}, Poland`);
                  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
                  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
                  const venueId = venue.id || `lgbtq-venue-${idx}`;
                  const isSaved = savedItems.has(venueId);

                  return (
                  <div key={idx} className="glass-panel rounded-3xl border border-purple-500/30 bg-wf-navy-mid/90 hover:border-purple-400/60 transition-all flex flex-col justify-between shadow-xl overflow-hidden">
                    <div className="p-6 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="text-lg font-black text-white leading-snug">{venue.name}</h4>
                        {venue.type && (
                          <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-bold max-w-full break-words">
                            {venue.type}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {venue.description}
                      </p>
                      <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-500/20 text-[11px] font-semibold text-purple-200">
                        🔥 {venue.vibe}
                      </div>
                      <div className="pt-3 mt-4 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>{venue.address}</span>
                      </div>
                    </div>
                    {/* Action Footer */}
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleItinerary(venueId);
                          }}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                            isSaved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                          }`}
                        >
                          {isSaved ? (
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
                        href={venue.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                        <span className="truncate">Visit Website</span>
                      </a>

                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                        <span className="truncate">Directions</span>
                      </a>

                      <a
                        href={mapSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                        <span className="truncate">View Map</span>
                      </a>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Inclusive Dining & Cafés */}
          {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'dining') && city.lgbtq.cafesAndDining && city.lgbtq.cafesAndDining.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-amber-400 font-black text-xs uppercase tracking-wider">
                <Utensils className="w-4 h-4" />
                <span>Culinary & Café Culture</span>
              </div>
              <h3 className="text-2xl font-black text-white">LGBTQ+-Friendly Cafés, Bakeries & Dining</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {city.lgbtq.cafesAndDining.map((rest, idx) => {
                  const mapSearchQuery = encodeURIComponent(`${rest.name}, ${rest.address || ''}, ${city.name}, Poland`);
                  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
                  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
                  const restId = rest.id || `lgbtq-dining-${idx}`;
                  const isSaved = savedItems.has(restId);

                  return (
                  <div key={idx} className="glass-panel rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 hover:border-amber-400/60 transition-all flex flex-col justify-between shadow-xl overflow-hidden">
                    <div className="p-6 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="text-lg font-black text-white leading-snug">{rest.name}</h4>
                        {rest.type && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-bold max-w-full break-words">
                            {rest.type}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {rest.description}
                      </p>
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 text-xs text-amber-200">
                        🍽️ <span className="font-bold text-amber-300">Signature:</span> {rest.signature}
                      </div>
                      <div className="pt-3 mt-4 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{rest.address}</span>
                      </div>
                    </div>
                    {/* Action Footer */}
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleItinerary(restId);
                          }}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                            isSaved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                          }`}
                        >
                          {isSaved ? (
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
                        href={rest.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                        <span className="truncate">Visit Website</span>
                      </a>

                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                        <span className="truncate">Directions</span>
                      </a>

                      <a
                        href={mapSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                        <span className="truncate">View Map</span>
                      </a>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. Living Culture, Activism & Wellness */}
          {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'community') && city.lgbtq.communityAndCulture && city.lgbtq.communityAndCulture.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-sky-400 font-black text-xs uppercase tracking-wider">
                <Landmark className="w-4 h-4" />
                <span>Queer Culture, Activism & Community</span>
              </div>
              <h3 className="text-2xl font-black text-white">Community Spaces & Cultural Heritage</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {city.lgbtq.communityAndCulture.map((spot, idx) => {
                  const mapSearchQuery = encodeURIComponent(`${spot.name}, ${city.name}, Poland`);
                  const spotId = spot.id || `lgbtq-culture-${idx}`;
                  const isSaved = savedItems.has(spotId);

                  return (
                  <div key={idx} className="glass-panel rounded-3xl border border-sky-500/30 bg-wf-navy-mid/90 shadow-xl flex flex-col justify-between overflow-hidden">
                    <div className="p-6 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="text-lg font-black text-white flex items-center space-x-2 leading-snug">
                          <span className="text-pink-400">♥</span>
                          <span>{spot.name}</span>
                        </h4>
                        {spot.type && (
                          <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 text-[10px] font-bold max-w-full break-words">
                            {spot.type}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                        {spot.description}
                      </p>
                      <div className="p-2.5 rounded-xl bg-sky-950/60 border border-sky-500/20 text-xs font-semibold text-sky-200">
                        💡 <span className="text-sky-300 font-bold">Highlight:</span> {spot.highlight}
                      </div>
                    </div>
                    {/* Action Footer */}
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleItinerary(spotId);
                          }}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                            isSaved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                          }`}
                        >
                          {isSaved ? (
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
                        href={spot.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                        <span className="truncate">Visit Website</span>
                      </a>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 5. Queer Winter & Holiday Experiences */}
          {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'winter') && city.lgbtq.winterExperiences && city.lgbtq.winterExperiences.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-amber-300 font-black text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Winter & Holiday Strolls</span>
              </div>
              <h3 className="text-2xl font-black text-white">Queer-Welcoming Winter Experiences</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {city.lgbtq.winterExperiences.map((item, idx) => {
                  const mapSearchQuery = encodeURIComponent(`${item.title}, ${city.name}, Poland`);
                  const itemId = item.id || `lgbtq-winter-${idx}`;
                  const isSaved = savedItems.has(itemId);

                  return (
                  <div key={idx} className="glass-panel rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 shadow-xl flex flex-col justify-between overflow-hidden">
                    <div className="p-6 space-y-3">
                      <h4 className="text-base font-black text-white flex items-center space-x-2">
                        <span className="text-amber-400">❄️</span>
                        <span>{item.title}</span>
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {item.description}
                      </p>
                    </div>
                    {/* Action Footer */}
                    <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleItinerary(itemId);
                          }}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                            isSaved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                          }`}
                        >
                          {isSaved ? (
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
                        className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                        <span className="truncate">Visit Website</span>
                      </a>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

