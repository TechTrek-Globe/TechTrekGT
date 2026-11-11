import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWayfinder } from '../context/WayfinderContext';
import { polandJourney } from '../data/poland-2026';
import { 
  ArrowLeft, ArrowRight, Calendar, Clock, MapPin, Train, Plane, Building, 
  Sparkles, Utensils, Landmark, Compass, Coffee, FileText, ChevronRight, Filter, Lock,
  BedDouble, Ticket, Users, Map, ChevronUp, ChevronDown, GripVertical, RotateCcw, ExternalLink
} from 'lucide-react';

import { PrivateBookingCard } from './itinerary/PrivateBookingCard';
import { DocumentViewerModal } from './DocumentViewerModal';
import { WeatherWidget } from './weather/WeatherWidget';
import { CalendarSubscribeModal } from './calendar/CalendarSubscribeModal';
import { 
  buildUnifiedDayTimeline, 
  getCustomTimelineOrder, 
  saveCustomTimelineOrder, 
  clearCustomTimelineOrder,
  getItemDestination,
  isConfirmedIntercityRail,
  isFlightScheduleItem,
  getTravelDomIdForScheduleItem,
  getTravelDocForScheduleItem
} from '../utils/itineraryTimeline';
import { FormatTime } from './Formatters';

export function ItineraryView() {
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();
  const { itinerary: privateItems = [], accommodations = [] } = useWayfinder();
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedDay, setSelectedDay] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('day');
      return p || 'all';
    }
    return 'all';
  });
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [customOrder, setCustomOrder] = useState(() => getCustomTimelineOrder());
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    const handleOrderChange = () => {
      setCustomOrder(getCustomTimelineOrder());
    };
    window.addEventListener('wayfinder:timeline-order-changed', handleOrderChange);
    return () => window.removeEventListener('wayfinder:timeline-order-changed', handleOrderChange);
  }, []);

  const moveTimelineItem = (dayNumber, fromIndex, direction, currentItems) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= currentItems.length) return;
    const newItems = [...currentItems];
    const [moved] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, moved);
    const newKeys = newItems.map(item => item.key);
    const updatedMap = { ...customOrder, [dayNumber]: newKeys };
    setCustomOrder(updatedMap);
    saveCustomTimelineOrder(updatedMap);
  };

  const handleDragStart = (e, dayNumber, index, key) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
    const cardEl = e.currentTarget.closest('[data-timeline-card]');
    if (cardEl && e.dataTransfer.setDragImage) {
      const rect = cardEl.getBoundingClientRect();
      const handleRect = e.currentTarget.getBoundingClientRect();
      const offsetX = handleRect.left - rect.left + handleRect.width / 2;
      const offsetY = handleRect.top - rect.top + handleRect.height / 2;
      e.dataTransfer.setDragImage(cardEl, offsetX, offsetY);
    }
    setDraggedItem({ day: dayNumber, index, key });
  };

  const handleDragOver = (e, dayNumber, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dropTarget || dropTarget.day !== dayNumber || dropTarget.index !== index) {
      setDropTarget({ day: dayNumber, index });
    }
  };

  const handleDrop = (e, dayNumber, targetIndex, currentItems) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.day !== dayNumber) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }
    const sourceIndex = draggedItem.index;
    if (sourceIndex === targetIndex) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }
    const newItems = [...currentItems];
    const [moved] = newItems.splice(sourceIndex, 1);
    newItems.splice(targetIndex, 0, moved);
    const newKeys = newItems.map(item => item.key);
    const updatedMap = { ...customOrder, [dayNumber]: newKeys };
    setCustomOrder(updatedMap);
    saveCustomTimelineOrder(updatedMap);
    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  const resetDayOrder = (dayNumber) => {
    clearCustomTimelineOrder(dayNumber);
    setCustomOrder(getCustomTimelineOrder());
  };

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const dayParam = params.get('day');
      if (dayParam) {
        setSelectedDay(dayParam);
        setSelectedCity('all');
        setTimeout(() => {
          const el = document.getElementById(`day-${dayParam}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  const pushRoute = (e, path) => {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const publicDays = polandJourney.itinerary || [];

  const filteredDays = publicDays.filter((dayItem) => {
    const matchesCity = selectedCity === 'all' || dayItem.cityId === selectedCity || dayItem.cityIds?.includes(selectedCity) || (selectedCity === 'torun' && dayItem.cityName.includes('Toruń'));
    const matchesDay = selectedDay === 'all' || dayItem.day.toString() === selectedDay.toString();
    return matchesCity && matchesDay;
  });

  const getIconForType = (type) => {
    switch (type) {
      case 'flight': return <Plane className="w-4 h-4" />;
      case 'rail': return <Train className="w-4 h-4" />;
      case 'transit': return <Clock className="w-4 h-4" />;
      case 'hotel': return <Building className="w-4 h-4" />;
      case 'market': return <Sparkles className="w-4 h-4" />;
      case 'sight': return <Landmark className="w-4 h-4" />;
      case 'food': return <Utensils className="w-4 h-4" />;
      case 'cafe': return <Coffee className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStyleForType = (type) => {
    switch (type) {
      case 'flight': return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'rail': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'transit': return 'bg-sky-500/10 text-sky-300 border-sky-500/25';
      case 'hotel': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'market': return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'sight': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'food': return 'bg-amber-400/15 text-amber-200 border-amber-400/30';
      default: return 'bg-white/10 text-white border-white/15';
    }
  };

  const getBadgeForType = (type) => {
    switch (type) {
      case 'flight': return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
      case 'rail': return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
      case 'transit': return 'bg-sky-500/15 text-sky-200 border-sky-400/30';
      case 'hotel': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
      case 'market': return 'bg-purple-500/20 text-purple-300 border-purple-400/40';
      case 'sight': return 'bg-blue-500/20 text-blue-300 border-blue-400/40';
      case 'food': return 'bg-amber-400/20 text-amber-200 border-amber-400/40';
      default: return 'bg-white/10 text-white border-white/20';
    }
  };

  // Match private D1 itinerary items to a given date string (YYYY-MM-DD), excluding removed Gmail imports
  const getPrivateItemsForDay = (dayDate, dayNumber) => {
    if (!privateItems || privateItems.length === 0) return [];
    return privateItems.filter(item => {
      if (item.notes && item.notes.includes('gmail:')) return false;
      const d = item.local_date || item.item_date || item.start_date || item.date || item.booking_date || '';
      if (!d) return dayNumber === 1;
      if (dayNumber === 1 && d <= '2026-12-04') return true;
      return d && d.toString().startsWith(dayDate);
    });
  };

  const validPrivateItems = (privateItems || []).filter(item => !item.notes?.includes('gmail:'));

  const getAccommodationsForDay = (dayDate) => accommodations.filter(item => item.check_in_date === dayDate);

  const handleOpenTravelDoc = (data, dayItem) => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    const matchedDoc = getTravelDocForScheduleItem(data, dayItem);
    if (!matchedDoc) return;
    setViewerDoc(matchedDoc);
    setIsDocViewerOpen(true);
  };

  return (
    <div className="w-full space-y-8 animate-fade-in">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <a
            href="/wayfinder/poland-christmas-2026"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
            className="inline-flex items-center text-xs sm:text-sm font-semibold text-wf-muted hover:text-white transition-colors mb-3 group"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5 transform group-hover:-translate-x-1 transition-transform" />
            <span>Back to Poland Journey</span>
          </a>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{polandJourney.dates}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-black uppercase tracking-wider">
              {polandJourney.totalDays || 10} Days • {polandJourney.totalNights || 9} Nights
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Trip Itinerary & Timeline
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-medium">
            Sequential day-by-day expedition route with exact stay dates, rail transit schedules, market rhythms, and sightseeing highlights.
          </p>
        </div>

        {/* Quick Route Links */}
        <div className="flex flex-wrap gap-2 shrink-0">
          {isAuthenticated && (
            <button
              onClick={() => setIsCalendarModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-400/40 hover:border-amber-400 text-amber-300 hover:text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm group"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>Sync / Export (.ics)</span>
            </button>
          )}
          <a
            href="/wayfinder/poland-christmas-2026"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
            className="px-3.5 py-2 rounded-xl bg-wf-navy-mid border border-white/10 hover:border-amber-400/50 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Train className="w-3.5 h-3.5 text-amber-400" />
            <span>Rail Map</span>
          </a>
          <a
            href={`/wayfinder/poland-christmas-2026/cities/${selectedCity !== 'all' ? selectedCity : 'krakow'}/markets`}
            onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${selectedCity !== 'all' ? selectedCity : 'krakow'}/markets`)}
            className="px-3.5 py-2 rounded-xl bg-wf-navy-mid border border-white/10 hover:border-amber-400/50 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Market Guide</span>
          </a>
        </div>
      </div>

      {/* Planning Status & Flexible Rhythm Banner */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-wf-navy-mid flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 mt-0.5">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <span>Flexible Planning Framework & Suggested Rhythm</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              This 10-day timeline provides a balanced, realistic schedule framework. Base lodging zones and daily activities are curated suggestions: use the city guides below to explore attractions, food targets, and hotel areas to customize your days.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href={`/wayfinder/poland-christmas-2026/cities/${selectedCity !== 'all' ? selectedCity : 'krakow'}/hotels`}
            onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${selectedCity !== 'all' ? selectedCity : 'krakow'}/hotels`)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-amber-400/40 text-slate-200 text-xs font-bold transition-colors flex items-center space-x-1"
          >
            <Building className="w-3.5 h-3.5 text-emerald-400" />
            <span>Lodging Base Zones</span>
          </a>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-amber-500/20 bg-wf-navy-mid/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter by City Stop</span>
          </div>

          {(selectedCity !== 'all' || selectedDay !== 'all') && (
            <button
              onClick={() => { setSelectedCity('all'); setSelectedDay('all'); }}
              className="text-xs text-wf-muted hover:text-white underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* City Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCity('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedCity === 'all' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'bg-slate-900/80 text-slate-300 border border-white/10 hover:border-white/20'}`}
          >
            All Cities (10 Days)
          </button>
          {polandJourney.route.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCity(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 ${selectedCity === c.id ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'bg-slate-900/80 text-slate-300 border border-white/10 hover:border-white/20'}`}
            >
              <span>{c.name}</span>
              <span className="text-[10px] opacity-75 font-mono">({c.itineraryDates ? c.itineraryDates.split(',')[0] : c.travelDays})</span>
            </button>
          ))}
        </div>

        {/* Day Number Quick-Scroller */}
        <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mr-1 shrink-0">Day:</span>
          <button
            onClick={() => setSelectedDay('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors ${selectedDay === 'all' ? 'bg-wf-blue text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            All
          </button>
          {publicDays.map((d) => (
            <button
              key={d.day}
              onClick={() => setSelectedDay(d.day.toString())}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors ${selectedDay === d.day.toString() ? 'bg-wf-blue text-white shadow-sm' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              title={`${d.displayDate} - ${d.cityName}`}
            >
              D{d.day} <span className="text-[10px] opacity-70 font-normal">({d.cityName.slice(0, 4)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Private Synced Items Overlay (If Authenticated User has Uploaded Bookings) */}
      {isAuthenticated && validPrivateItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-emerald-300 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{validPrivateItems.length} Private booking items synced from your Document Center</span>
          </div>
          <a
            href="/wayfinder/poland-christmas-2026/private/documents"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents')}
            className="text-xs text-emerald-300 hover:text-white underline font-semibold"
          >
            Manage Documents
          </a>
        </div>
      )}

      {/* Timeline Day List */}
      <div className="space-y-12">
        {filteredDays.length === 0 ? (
          <div className="text-center py-12 text-wf-muted bg-white/5 rounded-2xl border border-white/5">
            <p>No itinerary items match the selected filter criteria.</p>
            <button
              onClick={() => { setSelectedCity('all'); setSelectedDay('all'); }}
              className="mt-3 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
            >
              View Full 10-Day Timeline
            </button>
          </div>
        ) : (
          filteredDays.map((dayItem) => (
            <div key={dayItem.day} id={`day-${dayItem.day}`} className="relative scroll-mt-24">
              {/* Sticky Day Header */}
              <div className="sticky top-14 sm:top-16 z-20 bg-slate-950/95 backdrop-blur-md py-3 border-b border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg mb-6 rounded-t-2xl px-2">
                <div className="flex items-center space-x-3">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-xs sm:text-sm tracking-tight shadow-md">
                    Day 0{dayItem.day}
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-white leading-snug">
                      {dayItem.displayDate}
                    </h2>
                    <p className="text-xs text-amber-300 font-bold flex items-center space-x-1.5">
                      <span>{dayItem.cityName}</span>
                      <span>•</span>
                      <span className="text-slate-300 font-normal">{dayItem.theme}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <WeatherWidget city={dayItem.cityId} date={dayItem.date} locationName={dayItem.cityName} />
                  {dayItem.base && (
                    <span className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-300 flex items-center space-x-1 min-h-[36px] sm:min-h-[38px]">
                      <Building className="w-3 h-3 text-emerald-400" />
                      <span className="truncate max-w-[220px]">{dayItem.base}</span>
                    </span>
                  )}
                  <a
                    href={`/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/attractions`}
                    onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/attractions`)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-medium transition-colors min-h-[36px] sm:min-h-[38px] flex items-center"
                  >
                    Sights
                  </a>
                  <a
                    href={`/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/restaurants`}
                    onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/restaurants`)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-medium transition-colors min-h-[36px] sm:min-h-[38px] flex items-center"
                  >
                    Dining
                  </a>
                  <a
                    href={`/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}`}
                    onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}`)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold transition-colors shrink-0 min-h-[36px] sm:min-h-[38px] flex items-center"
                  >
                    City Guide
                  </a>
                  {customOrder[dayItem.day] && customOrder[dayItem.day].length > 0 && (
                    <button
                      type="button"
                      onClick={() => resetDayOrder(dayItem.day)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors min-h-[36px] sm:min-h-[38px] shrink-0"
                      title="Reset this day's items to original chronological order"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Reset Order</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Day Schedule Event Cards */}
              <div className="space-y-4 pl-4 sm:pl-6 border-l-2 border-amber-500/30 ml-3 sm:ml-4">
                {(() => {
                  const dayTimelineItems = buildUnifiedDayTimeline(
                    dayItem,
                    isAuthenticated ? getPrivateItemsForDay(dayItem.date, dayItem.day) : [],
                    isAuthenticated ? getAccommodationsForDay(dayItem.date) : [],
                    isAuthenticated,
                    customOrder[dayItem.day]
                  );

                  return dayTimelineItems.map((timelineItem, idx) => {
                    const isDragging = draggedItem?.day === dayItem.day && draggedItem?.index === idx;
                    const isDropTarget = dropTarget?.day === dayItem.day && dropTarget?.index === idx;

                    const isTrainItem = isConfirmedIntercityRail(timelineItem.data);
                    const isFlightItem = isFlightScheduleItem(timelineItem.data);
                    const travelDomId = getTravelDomIdForScheduleItem(timelineItem.data, dayItem.day);
                    const travelDoc = isAuthenticated ? getTravelDocForScheduleItem(timelineItem.data, dayItem) : null;
                    const isTravelCard = Boolean(travelDoc);
                    const destination = getItemDestination(timelineItem.data, dayItem.cityId);

                    const reorderControls = (
                      <div 
                        className="flex items-center space-x-0.5 bg-slate-950/80 px-1 py-0.5 rounded-xl border border-white/10 shrink-0 shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => moveTimelineItem(dayItem.day, idx, -1, dayTimelineItems)}
                          disabled={idx === 0}
                          className="p-1 rounded-lg hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
                          title="Move up"
                          aria-label="Move item up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTimelineItem(dayItem.day, idx, 1, dayTimelineItems)}
                          disabled={idx === dayTimelineItems.length - 1}
                          className="p-1 rounded-lg hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
                          title="Move down"
                          aria-label="Move item down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <div 
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, dayItem.day, idx, timelineItem.key)}
                          onDragEnd={handleDragEnd}
                          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-amber-300 cursor-grab active:cursor-grabbing transition-colors select-none"
                          title="Drag handle to reorder (text in tile remains selectable)"
                          aria-label="Drag handle to reorder"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    );

                    return (
                      <div
                        key={timelineItem.key}
                        id={travelDomId || timelineItem.key}
                        data-timeline-card="true"
                        data-travel-id={travelDomId}
                        onDragOver={(e) => handleDragOver(e, dayItem.day, idx)}
                        onDrop={(e) => handleDrop(e, dayItem.day, idx, dayTimelineItems)}
                        className={`select-text transition-all duration-150 ${isDragging ? 'opacity-40 scale-[0.98]' : ''}`}
                      >
                        {isDropTarget && (
                          <div className="h-1.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 rounded-full my-2 shadow-[0_0_12px_rgba(245,158,11,0.9)] animate-pulse" />
                        )}
                        {timelineItem.type === 'accommodation' || timelineItem.type === 'private' ? (
                          isAuthenticated ? (
                            <PrivateBookingCard item={timelineItem.data} reorderControls={reorderControls} />
                          ) : null
                        ) : (
                          <div className="relative group">
                            {/* Node on Vertical Track */}
                            <div className="absolute -left-[23px] sm:-left-[31px] top-4 w-4 h-4 sm:w-4 sm:h-4 rounded-full border-2 border-slate-950 bg-amber-400 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(245,158,11,0.8)]" />

                            <div 
                              onClick={(e) => {
                                if (isAuthenticated && isTravelCard && !e.target.closest('a, button, input')) {
                                  handleOpenTravelDoc(timelineItem.data, dayItem);
                                }
                              }}
                              className={`glass-panel p-4 sm:p-5 rounded-2xl border ${
                                isAuthenticated && isTravelCard ? 'border-white/15 hover:border-amber-400/60 cursor-pointer' : 'border-white/10 group-hover:border-amber-500/40'
                              } transition-all shadow-md bg-slate-900/90 space-y-3`}
                              title={isAuthenticated && isTravelCard ? "Click to view ticket and travel details" : undefined}
                            >
                              {/* Top Bar: Time, Category Icon, Title, Badge, and Reorder Controls */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center space-x-2.5">
                                  {destination ? (
                                    <a
                                      href={destination.url}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        pushRoute(e, destination.url);
                                      }}
                                      className={`p-2 rounded-xl border ${getStyleForType(timelineItem.data.itemType)} shrink-0 hover:scale-110 hover:border-amber-400 hover:shadow-[0_0_14px_rgba(245,158,11,0.5)] transition-all cursor-pointer group/icon`}
                                      title={`${destination.buttonText} - Click to view in guide`}
                                      aria-label={destination.buttonText}
                                    >
                                      {getIconForType(timelineItem.data.itemType)}
                                    </a>
                                  ) : (
                                    <div className={`p-2 rounded-xl border ${getStyleForType(timelineItem.data.itemType)} shrink-0`}>
                                      {getIconForType(timelineItem.data.itemType)}
                                    </div>
                                  )}
                                  <div>
                                    {destination ? (
                                      <a
                                        href={destination.url}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          pushRoute(e, destination.url);
                                        }}
                                        className="font-bold text-white text-base sm:text-lg leading-tight hover:text-amber-300 transition-colors inline-block cursor-pointer"
                                        title={`${destination.buttonText} - Click to view in guide`}
                                      >
                                        {timelineItem.data.title}
                                      </a>
                                    ) : (
                                      <h3 className="font-bold text-white text-base sm:text-lg leading-tight group-hover:text-amber-200 transition-colors">
                                        {timelineItem.data.title}
                                      </h3>
                                    )}
                                    {timelineItem.data.location && (
                                      <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${timelineItem.data.location}, ${dayItem.cityName || 'Poland'}`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs text-slate-400 hover:text-amber-300 flex items-center space-x-1 mt-0.5 transition-colors group/loc cursor-pointer inline-flex max-w-fit"
                                        title="Open navigation directions in Google Maps"
                                      >
                                        <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 group-hover/loc:scale-110 transition-transform" />
                                        <span className="underline decoration-slate-600 hover:decoration-amber-400 underline-offset-2">
                                          {timelineItem.data.location}
                                        </span>
                                        <ExternalLink className="w-3 h-3 text-slate-500 group-hover/loc:text-amber-300 opacity-70 ml-0.5 shrink-0" />
                                      </a>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 shrink-0 self-start sm:self-center">
                                  {timelineItem.data.badge && (
                                    <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${getBadgeForType(timelineItem.data.itemType)}`}>
                                      {timelineItem.data.badge}
                                    </span>
                                  )}
                                  <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-white/10 font-mono font-bold text-xs text-sky-300">
                                    <FormatTime time={timelineItem.data.time} />
                                  </span>
                                  {reorderControls}
                                </div>
                              </div>

                              {/* Event Description */}
                              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                                {timelineItem.data.description}
                              </p>

                              {/* Suggested Food / Market / Attraction Guide Tile Button */}
                              {destination && (
                                <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                                  <a
                                    href={destination.url}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      pushRoute(e, destination.url);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm group/btn ${
                                      destination.type === 'food'
                                        ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40 text-amber-300'
                                        : destination.type === 'market'
                                          ? 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-400/40 text-purple-300'
                                          : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-400/40 text-sky-300'
                                    }`}
                                    title={`Open ${destination.buttonText}`}
                                  >
                                    {destination.type === 'food' && (
                                      <Utensils className="w-3.5 h-3.5 text-amber-400 group-hover/btn:scale-110 transition-transform" />
                                    )}
                                    {destination.type === 'market' && (
                                      <Sparkles className="w-3.5 h-3.5 text-purple-400 group-hover/btn:scale-110 transition-transform" />
                                    )}
                                    {destination.type === 'sight' && (
                                      <Landmark className="w-3.5 h-3.5 text-sky-400 group-hover/btn:scale-110 transition-transform" />
                                    )}
                                    <span>{destination.buttonText}</span>
                                    <ArrowRight className="w-3.5 h-3.5 opacity-80 group-hover/btn:translate-x-0.5 transition-transform" />
                                  </a>
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    {destination.cityName || dayItem.cityName} {destination.type === 'food' ? 'Dining Guide' : destination.type === 'market' ? 'Market Guide' : 'Attractions Guide'}
                                  </span>
                                </div>
                              )}

                              {/* Rail Ticket & Pass Action Trigger */}
                              {isAuthenticated && isTrainItem && travelDoc && (
                                <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenTravelDoc(timelineItem.data, dayItem)}
                                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-300 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm group/btn"
                                    title="Click to view train ticket and transit pass"
                                  >
                                    <Train className="w-3.5 h-3.5 text-amber-400 group-hover/btn:scale-110 transition-transform" />
                                    <span>View PKP Rail Ticket & Transit Details</span>
                                  </button>
                                  <span className="text-[11px] text-amber-300/80 font-mono">
                                    {travelDoc.details?.trainNumber || '1st-Class PKP Intercity'}
                                  </span>
                                </div>
                              )}

                              {/* Flight Arrival/Departure Document Trigger */}
                              {isAuthenticated && isFlightItem && travelDoc && (
                                <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenTravelDoc(timelineItem.data, dayItem)}
                                    className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm group/btn"
                                    title="Click to view flight ticket and confirmation"
                                  >
                                    <Plane className="w-3.5 h-3.5 text-sky-400 group-hover/btn:scale-110 transition-transform" />
                                    <span>View Delta Flight Confirmation</span>
                                  </button>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    {travelDoc.details?.flightLeg ? `${travelDoc.details.flightLeg} • ` : ''}Conf: <strong className="text-emerald-300">{travelDoc.details?.confirmation || 'GUDI3J'}</strong>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Navigation CTA */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-wf-navy-mid via-slate-900 to-slate-950 flex flex-col sm:flex-row items-center justify-between gap-4 mt-12">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-lg sm:text-xl font-bold text-white">
            Ready to explore specific city guides?
          </h3>
          <p className="text-xs sm:text-sm text-slate-300">
            Dive into attractions, market operating hours, food targets, and interactive maps for all 5 stops.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <a
            href="/wayfinder/poland-christmas-2026/cities/krakow"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/cities/krakow')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md"
          >
            Start with Kraków Guide
          </a>
          <a
            href="/wayfinder/poland-christmas-2026"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition-colors"
          >
            View Rail Route Map
          </a>
        </div>
      </div>

      {/* Universal Document Preview Modal */}
      {isAuthenticated && (
        <DocumentViewerModal
          isOpen={isDocViewerOpen}
          onClose={() => {
            setIsDocViewerOpen(false);
            setViewerDoc(null);
          }}
          doc={viewerDoc}
        />
      )}

      {/* Calendar Subscription & Export Modal */}
      {isAuthenticated && (
        <CalendarSubscribeModal
          isOpen={isCalendarModalOpen}
          onClose={() => setIsCalendarModalOpen(false)}
        />
      )}
    </div>
  );
}

export default ItineraryView;

