import React, { useState } from 'react';
import { 
  Compass, Map, Calendar, Train, Utensils, Bed, ArrowRight, CheckCircle2, 
  MapPin, Plane, Clock, Sparkles, Building, Landmark, Coffee, Lock,
  ChevronDown, ChevronUp, Layers, Eye, ShieldCheck, FileText,
  GripVertical, RotateCcw, ExternalLink
} from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { cityImages } from '../utils/cityImages';
import polandMapRouteClean from '../assets/poland-map-route-clean.png';
import { useAuth } from '../context/AuthContext';
import { useWayfinder } from '../context/WayfinderContext';
import { PrivateBookingCard } from './itinerary/PrivateBookingCard';
import { DocumentViewerModal } from './DocumentViewerModal';
import { WeatherWidget } from './weather/WeatherWidget';
import { CalendarSubscribeModal } from './calendar/CalendarSubscribeModal';
import { 
  buildUnifiedDayTimeline, 
  getCustomTimelineOrder, 
  saveCustomTimelineOrder, 
  clearCustomTimelineOrder,
  getItemDestination
} from '../utils/itineraryTimeline';
import { FormatTime, FormatText } from './Formatters';

const stopTransitInfo = {
  krakow: {
    arrivalBadge: '✈️ Air Arrival: Kraków Airport (KRK)',
    arrivalSub: 'Afternoon flight arrival into Kraków John Paul II International Airport (KRK). Direct 17-minute SKA1 commuter rail into Kraków Główny arrives ~14:45-15:15 CET, synchronizing with standard 15:00 hotel check-in.',
    nextTransitTitle: 'PKP Intercity IC 58 Galicja: Kraków Główny ➔ Wrocław Główny',
    nextTransitDetails: 'Departs Kraków Główny 11:50 • Arrives Wrocław Główny 14:50 • 3h 00m in 1st Class',
    nextTransitNotes: '1st-class carriages with dedicated luggage racks • Scenic Lower Silesian winter route'
  },
  wroclaw: {
    arrivalBadge: '🚆 Lower Silesian Capital & Fairytale Rynek',
    arrivalSub: 'Arrives Wrocław Główny at 14:50. Settle into lodging base near Market Square or Ostrów Tumski.',
    nextTransitTitle: 'PKP Intercity IC Train: Wrocław Główny ➔ Poznań Główny',
    nextTransitDetails: 'Departs Wrocław Główny 10:35 • Arrives Poznań Główny 12:15 • ~1h 40m in 1st Class',
    nextTransitNotes: 'Northbound rail transition into Greater Poland (Wielkopolska)'
  },
  poznan: {
    arrivalBadge: '🚆 Greater Poland Capital & Stary Rynek',
    arrivalSub: 'Arrives Poznań Główny at 12:15. Check into central base near Stary Rynek & Plac Wolności.',
    nextTransitTitle: 'PKP Morning Rail: Poznań Główny ➔ Toruń Główny (Day Stop)',
    nextTransitDetails: 'Departs Poznań Główny 08:30 • Arrives Toruń Główny 10:15 • ~1h 45m',
    nextTransitNotes: 'Store luggage in Toruń Główny station lockers • Short bus across Vistula River'
  },
  torun: {
    arrivalBadge: '🚆 UNESCO Gothic Old Town & Gingerbread Capital',
    arrivalSub: 'Luggage in station lockers. Explore Gothic Old Town, Copernicus House & Living Gingerbread Museum.',
    nextTransitTitle: 'PKP Coastal Rail: Toruń Główny ➔ Gdańsk Główny',
    nextTransitDetails: 'Departs Toruń Główny 15:45 • Arrives Gdańsk Główny 17:30 • ~1h 45m',
    nextTransitNotes: 'Collect luggage from lockers • Direct scenic rail north to the Baltic Coast'
  },
  gdansk: {
    arrivalBadge: '🚆 Historic Hanseatic Port & Baltic Amber Coast',
    arrivalSub: 'Arrives Gdańsk Główny at 17:30. Check into waterfront or Granary Island base for 3-night holiday finale.',
    nextTransitTitle: '✈️ Return Flight: Gdańsk Lech Wałęsa (GDN) ➔ Home',
    nextTransitDetails: 'Early airport transfer (04:30) for DL9528 departure at 06:45',
    nextTransitNotes: 'Pre-book taxi or Bolt 35 min to airport • Ample time for international check-in & security'
  }
};

function getIconForType(type) {
  switch (type) {
    case 'flight': return <Plane className="w-4 h-4" />;
    case 'rail': return <Train className="w-4 h-4" />;
    case 'hotel': return <Building className="w-4 h-4" />;
    case 'market': return <Sparkles className="w-4 h-4" />;
    case 'sight': return <Landmark className="w-4 h-4" />;
    case 'food': return <Utensils className="w-4 h-4" />;
    case 'cafe': return <Coffee className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getStyleForType(type) {
  switch (type) {
    case 'flight': return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'rail': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'hotel': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'market': return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'sight': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'food': return 'bg-amber-400/15 text-amber-200 border-amber-400/30';
    case 'cafe': return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
    default: return 'bg-white/10 text-white border-white/15';
  }
}

function getBadgeForType(type) {
  switch (type) {
    case 'flight': return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
    case 'rail': return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
    case 'hotel': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
    case 'market': return 'bg-purple-500/20 text-purple-300 border-purple-400/40';
    case 'sight': return 'bg-blue-500/20 text-blue-300 border-blue-400/40';
    case 'food': return 'bg-amber-400/20 text-amber-200 border-amber-400/40';
    default: return 'bg-white/10 text-white border-white/20';
  }
}

function getDaysForCity(cityId) {
  return (polandJourney.itinerary || []).filter(dayItem => {
    if (dayItem.cityId === cityId) return true;
    if (dayItem.cityIds && dayItem.cityIds.includes(cityId)) return true;
    if (cityId === 'torun' && dayItem.cityName && dayItem.cityName.includes('Toruń')) return true;
    return false;
  }).map(dayItem => {
    if (dayItem.day === 7) {
      if (cityId === 'torun') {
        return {
          ...dayItem,
          theme: 'UNESCO Gingerbread Day Stop (Vistula River)',
          schedule: dayItem.schedule.filter(s => ['07:45', '08:30', '10:30', '12:00', '13:30', '15:45'].includes(s.time))
        };
      }
      if (cityId === 'gdansk') {
        return {
          ...dayItem,
          theme: 'Baltic Coast Arrival & Targ Węglowy Market',
          schedule: dayItem.schedule.filter(s => ['17:00', '18:30', '19:45', '21:00'].includes(s.time))
        };
      }
    }
    return dayItem;
  });
}

function JourneyStopSchedule({
  city,
  idx,
  totalCount,
  days,
  privateItems,
  accommodations,
  pushRoute,
  isExpanded,
  nextStopExpanded,
  onToggleExpand,
  transitInfo,
  onOpenDocViewer,
  isAuthenticated: propIsAuth,
  highlightedTravelId,
  onOpenTravelDoc
}) {
  const { isAuthenticated: contextIsAuth } = useAuth();
  const isAuthenticated = propIsAuth !== undefined ? propIsAuth : contextIsAuth;
  const [customOrder, setCustomOrder] = useState(() => getCustomTimelineOrder());
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  React.useEffect(() => {
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

  return (
    <div className="space-y-4">
      {/* Stop Card */}
      <div className="glass-panel rounded-3xl border border-amber-500/30 shadow-2xl bg-gradient-to-br from-wf-navy-mid/95 via-slate-900/90 to-slate-950">
        {/* Stop Header Banner */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
            {/* Thumbnail */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-amber-400 shrink-0 shadow-lg relative bg-slate-950">
              <img
                src={cityImages[city.id]}
                alt={city.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider shadow-sm">
                  Stop 0{idx + 1}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 font-bold text-[10px] sm:text-xs">
                  {city.nights > 0 ? `${city.nights} Nights` : 'Day Stop'}
                </span>
                {city.itineraryDates && (
                  <span className="text-xs font-semibold text-amber-200/90">
                    {city.itineraryDates}
                  </span>
                )}
                <WeatherWidget city={city.id} date={city.startDate} locationName={city.name} className="shadow-sm" />
              </div>

              <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight truncate">
                {city.name}
              </h3>

              {transitInfo?.arrivalBadge && (
                <div className="text-xs text-sky-300 font-medium mt-1 flex flex-wrap items-center gap-2">
                  <span className="truncate"><FormatText text={transitInfo.arrivalBadge} /></span>
                  {city.id === 'krakow' && onOpenDocViewer && (
                    <button
                      type="button"
                      onClick={onOpenDocViewer}
                      className="px-2 py-0.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40 text-[10px] font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                      title="View Delta flight document"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      <span>View Document</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stop Actions & Guide Links */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={`/wayfinder/poland-christmas-2026/cities/${city.id}`}
              onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${city.id}`)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md hover-lift min-h-[38px]"
            >
              <span>{city.name} Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <a
              href={`/wayfinder/poland-christmas-2026/cities/${city.id}/markets`}
              onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${city.id}/markets`)}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-colors min-h-[38px] flex items-center"
            >
              <span>Markets</span>
            </a>
            <a
              href={`/wayfinder/poland-christmas-2026/cities/${city.id}/attractions`}
              onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${city.id}/attractions`)}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-colors min-h-[38px] flex items-center"
            >
              <span>Sights</span>
            </a>
            <button
              onClick={onToggleExpand}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors min-h-[38px]"
              aria-label={isExpanded ? 'Collapse schedule' : 'Expand schedule'}
            >
              <span>{isExpanded ? 'Hide Schedule' : `View ${days.length} Days`}</span>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
            </button>
          </div>
        </div>

        {/* Expandable Schedule Body */}
        {isExpanded && (
          <div className="p-4 sm:p-6 space-y-8 animate-fade-in">
            {days.map((dayItem) => {
              const dayPrivate = isAuthenticated ? (privateItems || []).filter(p => {
                if (p.notes && p.notes.includes('gmail:')) return false;
                const d = p.local_date || p.item_date || p.start_date || p.date || p.booking_date || '';
                if (!d) return dayItem.day === 1;
                if (dayItem.day === 1 && d <= '2026-12-04') return true;
                return d && d.toString().startsWith(dayItem.date);
              }) : [];
              const dayAccommodations = isAuthenticated ? (accommodations || []).filter(a => a.check_in_date === dayItem.date) : [];

              return (
                <div key={dayItem.day} className="relative space-y-4">
                  {/* Day Header Sub-strip */}
                  <div className="sticky top-14 sm:top-16 z-20 p-3 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg">
                    <div className="flex items-center space-x-3">
                      <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-xs">
                        Day 0{dayItem.day}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center space-x-2">
                          <span>{dayItem.displayDate}</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-amber-300 font-medium text-xs">{dayItem.theme}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 self-start sm:self-center">
                      <WeatherWidget city={city.id} date={dayItem.date} locationName={dayItem.displayDate} />
                      {dayItem.base && (
                        <div className="text-xs text-slate-400 flex items-center space-x-1">
                          <Building className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate max-w-[260px]">{dayItem.base}</span>
                        </div>
                      )}
                      {customOrder[dayItem.day] && customOrder[dayItem.day].length > 0 && (
                        <button
                          type="button"
                          onClick={() => resetDayOrder(dayItem.day)}
                          className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center space-x-1 transition-colors shrink-0"
                          title="Reset this day's items to original chronological order"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Day Events Timeline */}
                  <div className="space-y-3 pl-4 sm:pl-6 border-l-2 border-amber-500/30 ml-3 sm:ml-4">
                    {(() => {
                      const dayTimelineItems = buildUnifiedDayTimeline(
                        dayItem,
                        dayPrivate,
                        dayAccommodations,
                        isAuthenticated,
                        customOrder[dayItem.day]
                      );

                      return dayTimelineItems.map((timelineItem, idx) => {
                        const isDragging = draggedItem?.day === dayItem.day && draggedItem?.index === idx;
                        const isDropTarget = dropTarget?.day === dayItem.day && dropTarget?.index === idx;
                        const destination = getItemDestination(timelineItem.data, city.id || dayItem.cityId);

                        const reorderControls = (
                          <div 
                            className="flex items-center space-x-0.5 bg-slate-950/80 px-1 py-0.5 rounded-xl border border-white/10 shrink-0 shadow-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => moveTimelineItem(dayItem.day, idx, -1, dayTimelineItems)}
                              disabled={idx === 0}
                              className="p-0.5 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
                              title="Move up"
                              aria-label="Move item up"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTimelineItem(dayItem.day, idx, 1, dayTimelineItems)}
                              disabled={idx === dayTimelineItems.length - 1}
                              className="p-0.5 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
                              title="Move down"
                              aria-label="Move item down"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            <div 
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, dayItem.day, idx, timelineItem.key)}
                              onDragEnd={handleDragEnd}
                              className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-amber-300 cursor-grab active:cursor-grabbing transition-colors select-none"
                              title="Drag handle to reorder (text in tile remains selectable)"
                              aria-label="Drag handle to reorder"
                            >
                              <GripVertical className="w-3 h-3" />
                            </div>
                          </div>
                        );

                        const itemType = (timelineItem.data.itemType || timelineItem.data.item_type || timelineItem.data.docType || '').toLowerCase();
                        const isTrainItem = itemType === 'rail' || itemType === 'train';
                        const isFlightItem = itemType === 'flight' || (timelineItem.data.title || '').includes('DL9208') || (timelineItem.data.title || '').includes('Return Flight');

                        let travelDomId = null;
                        if (isFlightItem && dayItem.day === 1) {
                          travelDomId = 'travel-flight-krk';
                        } else if (isFlightItem && dayItem.day === 10) {
                          travelDomId = 'travel-flight-gdn';
                        } else if (isTrainItem && dayItem.day === 4) {
                          travelDomId = 'travel-train-krakow-wroclaw';
                        } else if (isTrainItem && dayItem.day === 6) {
                          travelDomId = 'travel-train-wroclaw-poznan';
                        } else if (isTrainItem && dayItem.day === 7) {
                          const timeStr = timelineItem.data.time || timelineItem.data.local_time || '';
                          if (timeStr.startsWith('08') || (timelineItem.data.title || '').toLowerCase().includes('poznań') || (timelineItem.data.title || '').toLowerCase().includes('poznan') || (timelineItem.data.title || '').toLowerCase().includes('toruń') || (timelineItem.data.title || '').toLowerCase().includes('torun')) {
                            travelDomId = 'travel-train-poznan-torun';
                          } else {
                            travelDomId = 'travel-train-torun-gdansk';
                          }
                        }

                        const isTravelCard = isTrainItem || isFlightItem;
                        const isHighlighted = highlightedTravelId && (highlightedTravelId === travelDomId || highlightedTravelId === timelineItem.key);

                        return (
                          <div
                            key={timelineItem.key}
                            id={travelDomId || timelineItem.key}
                            data-timeline-card="true"
                            data-travel-id={travelDomId}
                            onDragOver={(e) => handleDragOver(e, dayItem.day, idx)}
                            onDrop={(e) => handleDrop(e, dayItem.day, idx, dayTimelineItems)}
                            className={`select-text transition-all duration-300 ${
                              isHighlighted
                                ? 'ring-4 ring-amber-400 ring-offset-4 ring-offset-slate-950 rounded-2xl shadow-[0_0_28px_rgba(245,158,11,0.9)] scale-[1.01]'
                                : ''
                            } ${isDragging ? 'opacity-40 scale-[0.98]' : ''}`}
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
                                <div className="absolute -left-[23px] sm:-left-[31px] top-4 w-4 h-4 rounded-full border-2 border-slate-950 bg-amber-400 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                                <div 
                                  onClick={(e) => {
                                    if (isTravelCard && onOpenTravelDoc && !e.target.closest('a, button, input')) {
                                      onOpenTravelDoc(timelineItem.data, dayItem);
                                    }
                                  }}
                                  className={`glass-panel p-4 rounded-2xl border ${
                                    isTravelCard ? 'border-white/15 hover:border-amber-400/60 cursor-pointer' : 'border-white/10 group-hover:border-amber-500/40'
                                  } transition-all shadow-md bg-slate-900/90 space-y-2.5`}
                                  title={isTravelCard ? "Click to view ticket and travel details" : undefined}
                                >
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
                                            className="font-bold text-white text-sm sm:text-base leading-tight hover:text-amber-300 transition-colors inline-block cursor-pointer"
                                            title={`${destination.buttonText} - Click to view in guide`}
                                          >
                                            {timelineItem.data.title}
                                          </a>
                                        ) : (
                                          <h4 className="font-bold text-white text-sm sm:text-base leading-tight group-hover:text-amber-200 transition-colors">
                                            {timelineItem.data.title}
                                          </h4>
                                        )}
                                        {timelineItem.data.location && (
                                          <a
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${timelineItem.data.location}, ${city.name || 'Poland'}`)}`}
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
                                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${getBadgeForType(timelineItem.data.itemType)}`}>
                                          {timelineItem.data.badge}
                                        </span>
                                      )}
                                      <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-white/10 font-mono font-bold text-xs text-sky-300">
                                        <FormatTime time={timelineItem.data.time} />
                                      </span>
                                      {reorderControls}
                                    </div>
                                  </div>

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
                                        {city.name} {destination.type === 'food' ? 'Dining Guide' : destination.type === 'market' ? 'Market Guide' : 'Attractions Guide'}
                                      </span>
                                    </div>
                                  )}

                                  {/* Rail Ticket & Pass Action Trigger */}
                                  {isTrainItem && onOpenTravelDoc && (
                                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onOpenTravelDoc(timelineItem.data, dayItem)}
                                        className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-300 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm group/btn"
                                        title="Click to view train ticket and transit pass"
                                      >
                                        <Train className="w-3.5 h-3.5 text-amber-400 group-hover/btn:scale-110 transition-transform" />
                                        <span>View PKP Rail Ticket & Transit Details</span>
                                      </button>
                                      <span className="text-[11px] text-amber-300/80 font-mono">
                                        1st-Class PKP Intercity
                                      </span>
                                    </div>
                                  )}

                                  {/* Flight Arrival/Departure Document Trigger */}
                                  {isFlightItem && onOpenTravelDoc && (
                                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onOpenTravelDoc(timelineItem.data, dayItem)}
                                        className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm group/btn"
                                        title="Click to view flight ticket and confirmation"
                                      >
                                        <Plane className="w-3.5 h-3.5 text-sky-400 group-hover/btn:scale-110 transition-transform" />
                                        <span>View Delta Flight Confirmation</span>
                                      </button>
                                      <span className="text-[11px] text-slate-400 font-mono">
                                        Conf: <strong className="text-emerald-300">GUDI3J</strong>
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
              );
            })}
          </div>
        )}
      </div>

      {/* Transit Connector to Next Stop (shown when next stop schedule is collapsed to avoid duplicating the train card inside the timeline) */}
      {idx < totalCount - 1 && transitInfo?.nextTransitTitle && !nextStopExpanded && (
        <div className="my-2 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 border border-amber-500/30">
              <Train className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center space-x-2">
                <span>{transitInfo.nextTransitTitle}</span>
              </div>
              <div className="text-[11px] text-amber-300/90 font-medium">
                <FormatText text={transitInfo.nextTransitDetails} />
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 hidden md:inline">
            {transitInfo.nextTransitNotes}
          </span>
        </div>
      )}
    </div>
  );
}

function CityRouteCard({ city, idx, totalCount, pushRoute, onSelectSchedule }) {
  return (
    <div 
      className="glass-panel rounded-2xl relative hover-lift cursor-pointer overflow-hidden border border-white/5 hover:border-amber-500/40 transition-colors group flex flex-col justify-between" 
      onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${city.id}`)}
    >
      {idx < totalCount - 1 && (
        <div className="hidden lg:block absolute top-1/2 -right-4 w-4 h-px bg-white/20 z-10" />
      )}
      <div className="h-44 sm:h-48 w-full relative overflow-hidden bg-slate-950">
        <img 
          src={cityImages[city.id]} 
          alt={city.name} 
          className="w-full h-full object-cover object-center" 
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/50 to-transparent"></div>
      </div>

      <div className="p-4 relative z-10 flex-1 flex flex-col justify-between">
        <div>
          <div className="text-amber-300 text-[10px] font-black uppercase tracking-widest mb-1 drop-shadow-md">
            Stop 0{idx + 1}
          </div>
          <h3 className="text-xl font-bold text-white mb-1 drop-shadow-md">{city.name}</h3>
          <div className="flex items-center justify-between gap-1 mb-2">
            <p className="text-xs text-amber-100/80 font-medium">
              {city.nights > 0 ? `${city.nights} nights` : 'Day Stop'}
            </p>
            {city.itineraryDates && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                {city.itineraryDates.split(',')[0]}
              </span>
            )}
          </div>
          <div className="text-xs text-wf-cream/80 line-clamp-2 leading-relaxed mb-3">
            {city.focus}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectSchedule(city.id);
          }}
          className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition-colors flex items-center justify-center space-x-1"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>View Stop Schedule</span>
        </button>
      </div>
    </div>
  );
}

export function PolandLanding() {
  const pushRoute = (e, path) => {
    if (e) e.preventDefault();
    if (path.includes('scroll=journey-sequence') || path.includes('#journey-sequence')) {
      const el = document.getElementById('journey-sequence');
      const targetY = el ? Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - 80) : 440;
      window.scrollTo({ top: targetY, behavior: 'instant' });
    } else if (!path.includes('/cities/')) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  React.useLayoutEffect(() => {
    const isScrollRequested = window.location.search.includes('scroll=journey-sequence') || window.location.hash === '#journey-sequence';
    if (isScrollRequested) {
      const el = document.getElementById('journey-sequence');
      if (el) {
        const yOffset = -80;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      }
    }
  }, []);

  const { isAuthenticated, user, setIsAuthModalOpen } = useAuth();
  const { itinerary: privateItems = [], accommodations = [] } = useWayfinder() || {};
  const [selectedStopFilter, setSelectedStopFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards');
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [highlightedTravelId, setHighlightedTravelId] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [expandedStops, setExpandedStops] = useState({
    krakow: true,
    wroclaw: true,
    poznan: true,
    torun: true,
    gdansk: true
  });

  const mapTrainSegments = [
    {
      id: 'travel-train-krakow-wroclaw',
      cityId: 'wroclaw',
      dayNumber: 4,
      label: 'PKP Intercity IC 58 Galicja: Kraków ➔ Wrocław (Day 4)',
      shortLabel: 'PKP • DAY 4',
      top: '69.5%',
      left: '46%'
    },
    {
      id: 'travel-train-wroclaw-poznan',
      cityId: 'poznan',
      dayNumber: 6,
      label: 'PKP Intercity IC: Wrocław ➔ Poznań (Day 6)',
      shortLabel: 'PKP • DAY 6',
      top: '51%',
      left: '32%'
    },
    {
      id: 'travel-train-poznan-torun',
      cityId: 'torun',
      dayNumber: 7,
      label: 'PKP Morning Rail: Poznań ➔ Toruń (Day 7)',
      shortLabel: 'PKP • DAY 7',
      top: '38.5%',
      left: '38%'
    },
    {
      id: 'travel-train-torun-gdansk',
      cityId: 'gdansk',
      dayNumber: 7,
      label: 'PKP Coastal Rail: Toruń ➔ Gdańsk (Day 7)',
      shortLabel: 'PKP • DAY 7',
      top: '25.5%',
      left: '47.5%'
    }
  ];

  const navigateToTravel = (travelId, cityId, dayNumber) => {
    if (viewMode !== 'schedule') {
      setViewMode('schedule');
    }
    if (selectedStopFilter !== 'all' && selectedStopFilter !== cityId) {
      setSelectedStopFilter('all');
    }
    setExpandedStops(prev => ({ ...prev, [cityId]: true }));
    setHighlightedTravelId(travelId);

    setTimeout(() => {
      const el = document.getElementById(travelId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const dayEl = document.getElementById(`day-${dayNumber}`) || document.getElementById('journey-sequence');
        if (dayEl) {
          dayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 120);

    setTimeout(() => {
      setHighlightedTravelId(null);
    }, 3500);
  };

  const handleOpenTravelDoc = (data, dayItem) => {
    const itemType = (data?.itemType || data?.item_type || data?.docType || '').toLowerCase();
    const isTrain = itemType === 'rail' || itemType === 'train';

    if (isTrain) {
      let customDoc = null;
      if (dayItem.day === 4) {
        customDoc = {
          id: '967d6a06-610d-4c56-a95f-d4ca5a5d1769',
          filename: 'Bilet - WN71563945.pdf',
          safe_display_name: 'PKP Intercity IC 58 Galicja: Kraków Gł. - Wrocław Gł.',
          item_type: 'rail',
          detected_doc_type: 'rail',
          details: {
            confirmation: 'WN 71563945',
            trainNumber: 'IC 58 Galicja',
            route: 'Kraków Główny ➔ Wrocław Główny',
            departureTime: '11:50',
            arrivalTime: '14:50',
            date: 'Monday, Dec 7, 2026',
            seats: 'Carriage 272, Seats 34 & 36 (1st Class)',
            passengers: 'Ronald Milton Few, Jonathan Kemp',
            provider: 'PKP Intercity S.A.',
            fare: '128.00 PLN (~$34.13 USD)',
            location: 'Kraków Główny Central Station'
          }
        };
      } else if (dayItem.day === 6) {
        customDoc = {
          id: 'pkp-wroclaw-poznan',
          filename: 'PKP_Intercity_Wroclaw_Poznan.pdf',
          safe_display_name: 'PKP Intercity IC: Wrocław Główny ➔ Poznań Główny',
          item_type: 'rail',
          detected_doc_type: 'rail',
          details: {
            confirmation: 'SCHEDULED-PKP-06',
            trainNumber: 'PKP Intercity IC Direct',
            route: 'Wrocław Główny ➔ Poznań Główny',
            departureTime: '10:35',
            arrivalTime: '12:15',
            date: 'Wednesday, Dec 9, 2026',
            seats: '1st Class Assigned Seating (Quiet Zone)',
            passengers: '2 Adults',
            provider: 'PKP Intercity S.A.',
            location: 'Wrocław Główny Central Station'
          }
        };
      } else if (dayItem.day === 7 && ((data.time || '').startsWith('08') || (data.title || '').toLowerCase().includes('poznań') || (data.title || '').toLowerCase().includes('poznan'))) {
        customDoc = {
          id: 'pkp-poznan-torun',
          filename: 'PKP_Morning_Poznan_Torun.pdf',
          safe_display_name: 'PKP Morning Rail: Poznań Główny ➔ Toruń Główny',
          item_type: 'rail',
          detected_doc_type: 'rail',
          details: {
            confirmation: 'SCHEDULED-PKP-07A',
            trainNumber: 'PKP Morning Rail (Day Stop)',
            route: 'Poznań Główny ➔ Toruń Główny',
            departureTime: '08:30',
            arrivalTime: '10:15',
            date: 'Thursday, Dec 10, 2026',
            seats: '1st Class Seating',
            passengers: '2 Adults',
            provider: 'PKP Intercity S.A.',
            location: 'Poznań Główny'
          }
        };
      } else {
        customDoc = {
          id: 'pkp-torun-gdansk',
          filename: 'PKP_Coastal_Torun_Gdansk.pdf',
          safe_display_name: 'PKP Coastal Rail: Toruń Główny ➔ Gdańsk Główny',
          item_type: 'rail',
          detected_doc_type: 'rail',
          details: {
            confirmation: 'SCHEDULED-PKP-07B',
            trainNumber: 'PKP Coastal Intercity',
            route: 'Toruń Główny ➔ Gdańsk Główny',
            departureTime: '15:45',
            arrivalTime: '17:30',
            date: 'Thursday, Dec 10, 2026',
            seats: '1st Class Seating',
            passengers: '2 Adults',
            provider: 'PKP Intercity S.A.',
            location: 'Toruń Główny'
          }
        };
      }
      setViewerDoc(customDoc);
      setIsDocViewerOpen(true);
      return;
    }

    // Flight items
    if (dayItem.day === 10) {
      setViewerDoc({
        id: 'delta-return-poland',
        filename: 'Poland_Delta_Return.pdf',
        safe_display_name: 'Delta Air Lines DL9528: Gdańsk (GDN) ➔ Atlanta (ATL)',
        item_type: 'flight',
        detected_doc_type: 'flight',
        details: {
          confirmation: 'GUDI3J',
          passengers: 'Ronald Milton Few, Jonathan Kemp',
          flightLeg: 'DL9528 (GDN ➔ AMS ➔ ATL)',
          departureTime: '06:45 CET',
          touchdown: 'Dec 13, 2026',
          layover: 'Amsterdam Schiphol (AMS)'
        }
      });
    } else {
      setViewerDoc(null); // Defaults to inbound Delta flight
    }
    setIsDocViewerOpen(true);
  };

  const toggleStopExpand = (stopId) => {
    setExpandedStops(prev => ({ ...prev, [stopId]: !prev[stopId] }));
  };

  const toggleAllStops = (expand) => {
    setExpandedStops({
      krakow: expand,
      wroclaw: expand,
      poznan: expand,
      torun: expand,
      gdansk: expand
    });
  };

  const filteredRoute = selectedStopFilter === 'all'
    ? polandJourney.route
    : polandJourney.route.filter(c => c.id === selectedStopFilter);

  return (
    <div className="w-full pb-20 space-y-8">
      {/* Sleek Compact Hero & 3D Poland Route Map Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 shadow-2xl flex flex-col lg:flex-row items-stretch gap-6">
          {/* Left Text & Actions Column */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider">
                <Compass className="w-3.5 h-3.5" />
                <span>{polandJourney.dates}</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-snug">
                {polandJourney.title}
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {polandJourney.description}
              </p>
            </div>

            {/* Expedition Quick-Facts Strip */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white">5 Destinations</span>
              </div>
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white">{polandJourney.totalNights} Nights • {polandJourney.totalDays} Days</span>
              </div>
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                <Train className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white">1st-Class PKP Rail</span>
              </div>
            </div>
          </div>

          {/* Right Compact 3D Route Map Panel (100% Precise City, Track & Flight Paths) */}
          <div className="w-full lg:w-7/12 h-64 sm:h-80 md:h-96 lg:h-80 rounded-2xl overflow-hidden relative bg-slate-950 border border-amber-500/30 shadow-inner group shrink-0">
            <img 
              src={polandMapRouteClean} 
              alt="3D Poland Route Map" 
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 group-hover:scale-105" 
              fetchPriority="high"
            />

            {/* Glowing Golden Rail Track & Flight Path Vectors */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Train Rail Track: Kraków -> Wrocław -> Poznań -> Toruń -> Gdańsk */}
              <path 
                d="M 58 78 Q 45 70 36 60 T 30 44 T 48 34 T 45 18" 
                fill="none" 
                stroke="#f59e0b" 
                strokeWidth="2.5" 
                strokeDasharray="2 1"
                className="opacity-90 drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]"
              />
              <path 
                d="M 58 78 Q 45 70 36 60 T 30 44 T 48 34 T 45 18" 
                fill="none" 
                stroke="#fef3c7" 
                strokeWidth="1" 
                className="opacity-60"
              />

              {/* Incoming Flight Path: Air Arrival into Kraków */}
              <path 
                d="M 82 92 Q 70 86 58 78" 
                fill="none" 
                stroke="#38bdf8" 
                strokeWidth="1.8" 
                strokeDasharray="1.5 1.5"
                className="opacity-85 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
              />

              {/* Outgoing Flight Path: Air Departure out of Gdańsk */}
              <path 
                d="M 45 18 Q 32 12 20 6" 
                fill="none" 
                stroke="#38bdf8" 
                strokeWidth="1.8" 
                strokeDasharray="1.5 1.5"
                className="opacity-85 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
              />
            </svg>

            {/* Interactive Flight Badges */}
            {/* Incoming Flight Badge to Kraków (KRK) */}
            <button
              type="button"
              onClick={() => navigateToTravel('travel-flight-krk', 'krakow', 1)}
              className="absolute top-[88%] left-[80%] z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-110 group/flightin focus:outline-none"
              title="Delta Flight Arrival into Kraków (Day 1) - Click to jump to schedule"
            >
              <div className="px-2.5 py-1 rounded-full bg-slate-950/95 border border-sky-400 text-sky-300 text-[9px] sm:text-[10px] font-black tracking-wider uppercase flex items-center space-x-1.5 shadow-lg shadow-sky-950/80 backdrop-blur-md group-hover/flightin:bg-sky-500 group-hover/flightin:text-slate-950 group-hover/flightin:border-sky-300 transition-colors animate-pulse">
                <Plane className="w-3.5 h-3.5 text-sky-300 group-hover/flightin:text-slate-950 rotate-45 transition-colors" />
                <span>FLY IN: KRK</span>
              </div>
            </button>

            {/* Outgoing Flight Badge from Gdańsk (GDN) */}
            <button
              type="button"
              onClick={() => navigateToTravel('travel-flight-gdn', 'gdansk', 10)}
              className="absolute top-[8%] left-[20%] z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-110 group/flightout focus:outline-none"
              title="Delta Return Flight Departure from Gdańsk (Day 10) - Click to jump to schedule"
            >
              <div className="px-2.5 py-1 rounded-full bg-slate-950/95 border border-sky-400 text-sky-300 text-[9px] sm:text-[10px] font-black tracking-wider uppercase flex items-center space-x-1.5 shadow-lg shadow-sky-950/80 backdrop-blur-md group-hover/flightout:bg-sky-500 group-hover/flightout:text-slate-950 group-hover/flightout:border-sky-300 transition-colors animate-pulse">
                <Plane className="w-3.5 h-3.5 text-sky-300 group-hover/flightout:text-slate-950 -rotate-45 transition-colors" />
                <span>FLY OUT: GDN</span>
              </div>
            </button>

            {/* Interactive Train Transition Icons along Rail Tracks */}
            {mapTrainSegments.map((train) => (
              <button
                key={train.id}
                type="button"
                onClick={() => navigateToTravel(train.id, train.cityId, train.dayNumber)}
                style={{ top: train.top, left: train.left }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group/train cursor-pointer transition-transform hover:scale-125 focus:outline-none"
                title={`${train.label} - Click to jump to schedule and view ticket`}
                aria-label={train.label}
              >
                <div className="p-1.5 sm:p-2 rounded-full bg-slate-950/90 border-2 border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.7)] backdrop-blur-md group-hover/train:bg-amber-500 group-hover/train:text-slate-950 group-hover/train:border-amber-300 group-hover/train:ring-4 group-hover/train:ring-amber-500/40 transition-all flex items-center justify-center">
                  <Train className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 group-hover/train:text-slate-950 transition-colors" />
                </div>
                <div className="mt-0.5 px-1.5 py-0.5 rounded-md bg-slate-950/95 border border-amber-400/80 text-amber-300 font-mono font-bold text-[8px] sm:text-[9px] whitespace-nowrap shadow-md group-hover/train:bg-amber-500 group-hover/train:text-slate-950 transition-colors">
                  {train.shortLabel}
                </div>
              </button>
            ))}

            {/* Interactive City Micro Nodes */}
            <div className="absolute inset-0 z-20 pointer-events-auto">
              {polandJourney.route.map((item) => {
                const itemUrl = `/wayfinder/poland-christmas-2026/cities/${item.id}`;

                // Coordinates matching glowing SVG rail track points exactly
                const positions = {
                  krakow: 'top-[78%] left-[58%]',
                  wroclaw: 'top-[60%] left-[36%]',
                  poznan: 'top-[44%] left-[30%]',
                  torun: 'top-[34%] left-[48%]',
                  gdansk: 'top-[18%] left-[45%]'
                };

                return (
                  <a
                    key={item.id}
                    href={itemUrl}
                    onClick={(e) => pushRoute(e, itemUrl)}
                    className={`absolute flex flex-col items-center group/node cursor-pointer -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 ${positions[item.id] || 'top-1/2 left-1/2'}`}
                    title={`View ${item.name}`}
                  >
                    {/* Micro-Avatar Circle */}
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 border-amber-400 bg-slate-950 shadow-xl shadow-amber-500/60 relative flex items-center justify-center transition-all group-hover/node:border-amber-300 group-hover/node:ring-4 group-hover/node:ring-amber-500/40">
                      <img 
                        src={cityImages[item.id]} 
                        alt={`${item.name} timeline node - ${item.id === 'krakow' ? "Rynek Główny Christmas Market" : "Christmas Market"}`} 
                        className="w-full h-full object-cover" 
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    {/* City Label Badge */}
                    <div className="mt-0.5 px-2 py-0.5 rounded-full bg-slate-950/95 border border-amber-400/80 text-white font-black text-[9px] sm:text-[10px] tracking-tight shadow-lg backdrop-blur-md group-hover/node:bg-amber-500 group-hover/node:text-slate-950 transition-colors">
                      {item.name}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        {/* Journey Sequence Section */}
        <section id="journey-sequence" className="space-y-6 pt-2">
          {/* Section Header with Live Schedule Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center space-x-3">
                <Map className="w-6 h-6 text-amber-400" />
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Journey Sequence & 10-Day Schedule
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {isAuthenticated ? (
                  <span className="text-emerald-400 font-medium flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Signed In as {user?.name || user?.email || 'Traveler'} : Verified expedition schedule active with private confirmations</span>
                  </span>
                ) : (
                  <span>Official 10-day winter itinerary connecting all 5 stops from Kraków to Gdańsk</span>
                )}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-2 shrink-0">
              {isAuthenticated && (
                <button
                  onClick={() => setIsCalendarModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors min-h-[36px]"
                  title="Subscribe to live calendar feed or export .ics"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Calendar Sync</span>
                </button>
              )}
              {isAuthenticated ? (
                <a
                  href="/wayfinder/poland-christmas-2026/private/documents"
                  onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents')}
                  className="px-3 py-1.5 rounded-xl bg-wf-navy border border-wf-blue/30 text-wf-blue-lt hover:bg-wf-navy-lt text-xs font-semibold flex items-center space-x-1.5 transition-colors min-h-[36px]"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Document Vault</span>
                </a>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors min-h-[36px]"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sign In for Private Bookings</span>
                </button>
              )}
            </div>
          </div>

          {/* Controls Bar: Stop Filter Pills + View Mode Toggle */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-2xl border border-white/5 backdrop-blur-md">
            {/* Stop Filter Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedStopFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[34px] ${
                  selectedStopFilter === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                All Stops (5)
              </button>
              {polandJourney.route.map((city, idx) => (
                <button
                  key={city.id}
                  onClick={() => setSelectedStopFilter(city.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[34px] flex items-center space-x-1 ${
                    selectedStopFilter === city.id
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>0{idx + 1}</span>
                  <span>{city.name}</span>
                </button>
              ))}
            </div>

            {/* View Mode & Expand Controls */}
            <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
              {viewMode === 'schedule' && (
                <div className="flex items-center space-x-1 bg-slate-950/80 p-0.5 rounded-xl border border-white/10 text-[11px] font-semibold text-slate-300">
                  <button
                    onClick={() => toggleAllStops(true)}
                    className="px-2 py-1 hover:text-white rounded-lg transition-colors"
                  >
                    Expand All
                  </button>
                  <span className="text-white/20">|</span>
                  <button
                    onClick={() => toggleAllStops(false)}
                    className="px-2 py-1 hover:text-white rounded-lg transition-colors"
                  >
                    Collapse
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setViewMode('schedule')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                    viewMode === 'schedule'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Full Schedule Timeline View"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Schedule View</span>
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Compact Cards View"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cards View</span>
                </button>
              </div>
            </div>
          </div>

          {/* View Body */}
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-5 animate-fade-in">
              {filteredRoute.map((city) => (
                <CityRouteCard
                  key={city.id}
                  city={city}
                  idx={polandJourney.route.findIndex(r => r.id === city.id)}
                  totalCount={polandJourney.route.length}
                  pushRoute={pushRoute}
                  onSelectSchedule={(cId) => {
                    setSelectedStopFilter(cId);
                    setViewMode('schedule');
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {filteredRoute.map((city) => {
                const globalIdx = polandJourney.route.findIndex(r => r.id === city.id);
                const nextCity = polandJourney.route[globalIdx + 1];
                const cityDays = getDaysForCity(city.id);
                return (
                  <JourneyStopSchedule
                    key={city.id}
                    city={city}
                    idx={globalIdx}
                    totalCount={polandJourney.route.length}
                    days={cityDays}
                    privateItems={privateItems}
                    accommodations={accommodations}
                    pushRoute={pushRoute}
                    isExpanded={!!expandedStops[city.id]}
                    nextStopExpanded={nextCity ? !!expandedStops[nextCity.id] : false}
                    onToggleExpand={() => toggleStopExpand(city.id)}
                    transitInfo={stopTransitInfo[city.id]}
                    onOpenDocViewer={(doc) => {
                      setViewerDoc(doc || null);
                      setIsDocViewerOpen(true);
                    }}
                    highlightedTravelId={highlightedTravelId}
                    onOpenTravelDoc={handleOpenTravelDoc}
                    isAuthenticated={isAuthenticated}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* The Strategy */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-1">
            <h2 className="text-2xl font-bold text-white mb-4">The Strategy</h2>
            <p className="text-wf-muted mb-6">
              A balanced approach to winter travel in Poland, optimizing daylight sightseeing and evening market atmosphere.
            </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-4 rounded-xl bg-wf-navy-mid border border-white/5">
                <div className="p-2 rounded-lg bg-wf-blue/20 text-wf-blue-lt"><Calendar className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-medium text-white text-sm">Evening Anchor Strategy</div>
                  <div className="text-xs text-wf-muted mt-0.5">Markets open at dusk - plan sightseeing by day, market visits after 4pm.</div>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-4 rounded-xl bg-wf-navy-mid border border-white/5">
                <div className="p-2 rounded-lg bg-wf-amber/20 text-wf-amber"><Train className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-medium text-white text-sm">1st-Class PKP Rail Connections</div>
                  <div className="text-xs text-wf-muted mt-0.5">Book EIP Express InterCity Premium seats at least 7 days ahead.</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-2 glass-card p-6 sm:p-8 rounded-3xl">
            <h3 className="text-lg font-semibold text-white mb-4">Key Principles</h3>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-wf-amber shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">Markets as Evening Anchors</h4>
                  <p className="text-sm text-wf-muted mt-1">{polandJourney.marketStrategy}</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-wf-amber shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">1st-Class Rail Focus</h4>
                  <p className="text-sm text-wf-muted mt-1">Intercity moves are treated as rest periods. Booking 1st Class ensures space for luggage and a quieter environment between cities.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-wf-amber shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">Strategic Bases</h4>
                  <p className="text-sm text-wf-muted mt-1">All recommended hotel neighborhoods are within walking distance of the central squares, allowing easy retreat when the winter cold sets in.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Universal Document Preview Modal */}
        <DocumentViewerModal
          isOpen={isDocViewerOpen}
          onClose={() => {
            setIsDocViewerOpen(false);
            setViewerDoc(null);
          }}
          doc={viewerDoc}
        />

        {/* Calendar Subscription & Export Modal */}
        <CalendarSubscribeModal
          isOpen={isCalendarModalOpen}
          onClose={() => setIsCalendarModalOpen(false)}
        />
      </div>
    </div>
  );
}
