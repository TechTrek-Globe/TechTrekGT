import React, { useState } from 'react';
import { 
  Bed, BedDouble, MapPin, Train, Sparkles, Navigation, Compass, CheckCircle2, 
  Plus, Info, Plane, Clock, FileText, ExternalLink, Calendar, Users, ShieldCheck, 
  DollarSign 
} from 'lucide-react';
import { FormatText } from '../Formatters';
import { DocumentViewerModal } from '../DocumentViewerModal';
import { useWayfinder } from '../../context/WayfinderContext';
import { parseBookingMetadata } from '../itinerary/PrivateBookingCard';

export function findConfirmedHotelForCity(city, accommodations = [], itinerary = []) {
  if (!city) return null;
  const cId = (city.id || '').toLowerCase();
  const cName = (city.name || '').toLowerCase();
  const norm = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const targetId = norm(cId);
  const targetName = norm(cName);

  const candidates = [];
  for (const acc of accommodations) {
    if (acc) candidates.push(acc);
  }
  for (const item of itinerary) {
    const rawType = (item?.docType || item?.detected_doc_type || item?.item_type || '').toLowerCase();
    if (rawType === 'hotel' || rawType === 'accommodation' || rawType === 'lodging') {
      if (!candidates.some(c => c.id === item.id || (c.source_document_id && c.source_document_id === item.source_document_id))) {
        candidates.push(item);
      }
    }
  }

  for (const candidate of candidates) {
    const title = norm(candidate.title || candidate.hotel_name);
    const loc = norm(candidate.location || candidate.hotel_address);
    const checkIn = candidate.check_in_date || candidate.local_date || '';

    // Explicit city name in title or location
    if (loc.includes(targetId) || loc.includes(targetName) || title.includes(targetId) || title.includes(targetName)) {
      return candidate;
    }

    // Specific known venues per stop
    if (targetId.includes('krakow') && (title.includes('experior') || title.includes('destigo') || loc.includes('szewska'))) {
      return candidate;
    }
    if (targetId.includes('wroclaw') && (title.includes('altus') || loc.includes('altus'))) {
      return candidate;
    }
    if (targetId.includes('poznan') && (title.includes('brovaria') || loc.includes('brovaria'))) {
      return candidate;
    }
    if (targetId.includes('gdansk') && (title.includes('radisson') || loc.includes('radisson') || loc.includes('chmielna'))) {
      return candidate;
    }

    // Date window match
    if (city.startDate && city.endDate && checkIn) {
      if (checkIn >= city.startDate && checkIn < city.endDate) {
        return candidate;
      }
    }
  }

  return null;
}

function formatStayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (_) {}
  return dateStr;
}

export function CityHotelsTab({ 
  city, 
  savedItems, 
  toggleItinerary, 
  isAuthenticated 
}) {
  const { itinerary = [], accommodations = [], documents = [] } = useWayfinder() || {};
  const [isFlightDocViewerOpen, setIsFlightDocViewerOpen] = useState(false);
  const [isStayDocViewerOpen, setIsStayDocViewerOpen] = useState(false);

  const confirmedStay = findConfirmedHotelForCity(city, accommodations, itinerary);
  const confirmedStayDoc = confirmedStay?.source_document_id
    ? (documents || []).find((d) => d && d.id === confirmedStay.source_document_id) || null
    : null;
  const inboundFlightDoc = isAuthenticated
    ? (documents || []).find((d) => (d?.detected_doc_type || '').toLowerCase() === 'flight') || null
    : null;
  const inboundFlightItem = isAuthenticated
    ? (itinerary || []).find((i) => (i?.item_type || '').toLowerCase() === 'flight') || null
    : null;
  const meta = confirmedStay ? parseBookingMetadata(confirmedStay) : null;
  const hotelName = confirmedStay?.hotel_name || confirmedStay?.title || `Hotel in ${city.name}`;
  const hotelAddress = confirmedStay?.location || confirmedStay?.hotel_address || meta?.fields?.['address'] || meta?.fields?.['hotel_address'] || `${city.base || city.name}, Poland`;
  const checkInDate = confirmedStay?.check_in_date || confirmedStay?.local_date || meta?.fields?.['check_in_date'] || meta?.fields?.['check_in'] || city.startDate;
  const checkInTime = confirmedStay?.check_in_time || confirmedStay?.local_time || meta?.fields?.['check_in_time'] || '15:00';
  const checkOutDate = confirmedStay?.check_out_date || confirmedStay?.end_date || meta?.fields?.['check_out_date'] || meta?.fields?.['check_out'] || city.endDate;
  const checkOutTime = confirmedStay?.check_out_time || meta?.fields?.['check_out_time'] || '12:00';
  const confirmationNumber = confirmedStay?.confirmation_number || meta?.confNumber || meta?.fields?.['confirmation'];
  const roomType = confirmedStay?.room_type || meta?.fields?.['room_type'] || meta?.fields?.['room'] || 'Standard Room';
  const guests = confirmedStay?.guests || meta?.fields?.['guests'] || meta?.fields?.['party_size'] || '2 Adults';
  const totalCost = confirmedStay?.total_cost || meta?.fields?.['total_cost'] || meta?.fields?.['cost'];
  const currency = confirmedStay?.currency || meta?.fields?.['currency'] || 'USD';

  const hotelsList = city.hotels && city.hotels.length > 0 
    ? city.hotels 
    : [
        `Recommended Base: ${city.base || `${city.name} Historic Center`}`,
        `Proximity: Walking distance to ${city.markets?.[0]?.name || `${city.name} Christmas Market`}`,
        `Transit Connection: Easy access to ${city.transit?.station || `${city.name} Central Station`}`
      ];

  const mapSearchQuery = encodeURIComponent(`Hotels near ${city.base || city.name}, ${city.name}, Poland`);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
  const stayId = `hotel-base-${city.id}`;
  const isSaved = savedItems.has(stayId);

  return (
    <div id="hotels-section" className="space-y-6 animate-fade-in scroll-mt-32">
      {/* Header Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-2xl space-y-4">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/15 via-emerald-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider shadow-sm">
              <Bed className="w-3.5 h-3.5 text-amber-400" />
              <span>Lodging & Neighborhood Base</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Where to Stay in {city.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
              Optimal lodging zones chosen for walking access to Christmas market chalets, illuminated evening squares, and high-speed rail connections.
            </p>
          </div>

          <div className="shrink-0 flex items-center space-x-2">
            <span className="px-4 py-2 rounded-2xl bg-slate-900/90 border border-amber-500/30 text-amber-300 text-xs font-black shadow-md">
              {city.nights > 0 ? `🛌 ${city.nights} Nights Base` : '⚡ Day Stop (No Overnight Required)'}
            </span>
          </div>
        </div>
      </div>

      {/* Confirmed Hotel Stay Card (Authenticated & Booked) */}
      {isAuthenticated && confirmedStay && (
        <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-wf-navy-mid/95 to-slate-950 relative overflow-hidden shadow-2xl space-y-5 animate-fade-in">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Bar: Badge, Title & Navigation Actions */}
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black uppercase tracking-wider shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Your Confirmed Stay in {city.name}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-900/90 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold">
                  {city.nights > 0 ? `${city.nights} Nights Reserved` : 'Confirmed Booking'}
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center space-x-2.5">
                <BedDouble className="w-7 h-7 text-emerald-400 shrink-0" />
                <span>{hotelName}</span>
              </h3>

              {hotelAddress && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${hotelName}, ${hotelAddress}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm text-slate-300 hover:text-amber-300 flex items-center space-x-1.5 transition-colors group/addr inline-flex"
                  title="Open turn-by-turn directions in Google Maps"
                >
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0 group-hover/addr:scale-110 transition-transform" />
                  <span className="underline decoration-slate-600 hover:decoration-amber-400 underline-offset-2 font-medium">
                    {hotelAddress}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/addr:text-amber-300 opacity-80 shrink-0 ml-0.5" />
                </a>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-center">
              <button
                type="button"
                onClick={() => setIsStayDocViewerOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black flex items-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-slate-950" />
                <span>View Booking Voucher</span>
              </button>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${hotelName}, ${hotelAddress}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-slate-200 text-xs font-bold flex items-center space-x-1.5 transition-all"
              >
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>Get Directions</span>
              </a>
            </div>
          </div>

          {/* Stay Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Check-In */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Check-In</span>
              </div>
              <div className="text-white font-bold text-sm">
                {formatStayDate(checkInDate)}
              </div>
              <p className="text-slate-400 text-[11px]">
                From <strong className="text-slate-200">{checkInTime} CET</strong>
              </p>
            </div>

            {/* Check-Out */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-sky-400 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span>Check-Out</span>
              </div>
              <div className="text-white font-bold text-sm">
                {formatStayDate(checkOutDate)}
              </div>
              <p className="text-slate-400 text-[11px]">
                Until <strong className="text-slate-200">{checkOutTime} CET</strong> ({city.nights || 3} Nights)
              </p>
            </div>

            {/* Room & Guests */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-amber-400 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <BedDouble className="w-3.5 h-3.5 text-amber-400" />
                <span>Accommodation</span>
              </div>
              <div className="text-white font-bold text-sm truncate" title={roomType}>
                {roomType}
              </div>
              <p className="text-slate-400 text-[11px] flex items-center space-x-1">
                <Users className="w-3 h-3 text-slate-400" />
                <span>{guests}</span>
              </p>
            </div>

            {/* Confirmation & Cost */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
              <div className="text-emerald-300 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Confirmation & Total</span>
              </div>
              <div className="text-emerald-300 font-mono font-bold text-sm">
                {confirmationNumber || 'Verified Booking'}
              </div>
              <p className="text-slate-400 text-[11px]">
                {totalCost ? (
                  <>Total: <strong className="text-emerald-300 font-semibold">{totalCost} {currency}</strong> (Paid)</>
                ) : (
                  <>Booking Confirmed & Synchronized</>
                )}
              </p>
            </div>
          </div>

          {/* Location Proximity Highlight */}
          <div className="p-3 px-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-200/90 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-white">{hotelName}</strong> is positioned directly in <strong className="text-amber-300">{city.base || city.name}</strong> for easy walking access to illuminated Christmas chalets.
              </span>
            </span>

            <span className="text-[11px] text-slate-400 font-mono">
              Active Journey Stop: {city.name}
            </span>
          </div>
        </div>
      )}

      {/* Flight Arrival & Lodging Check-in Synchronization (for Krakow / Inbound Flight) */}
      {(city.id === 'krakow' || city.flightArrival) && (
        <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-sky-500/40 bg-gradient-to-br from-sky-950/60 via-wf-navy-mid to-slate-950 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-xl">
                <Plane className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Flight Arrival & Lodging Check-in Timing ({city.name})
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-black uppercase">
                    Inbound Flight
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Landing flight schedule synchronized with Old Town / Kazimierz accommodation check-in.
                </p>
              </div>
            </div>

            {isAuthenticated && inboundFlightDoc && (
              <button
                type="button"
                onClick={() => setIsFlightDocViewerOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer self-start sm:self-auto shrink-0 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span>View Flight Document</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs">
            {/* Touchdown & Timezone */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1.5">
              <div className="text-sky-300 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Touchdown & Timezone</span>
              </div>
              <div className="text-white font-bold text-sm">
                Friday, Dec 4, 2026 @ 13:30 CET
              </div>
              <p className="text-slate-400 text-[11px] leading-snug">
                Local Poland Time: Central European Time (CET / UTC+1). 6 hours ahead of US Eastern Time (Atlanta).
              </p>
            </div>

            {/* Flight Inbound Routing */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1.5">
              <div className="text-amber-300 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Plane className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAuthenticated && inboundFlightItem ? 'Flight Arrival Details' : 'Airport Transit Details'}</span>
              </div>
              <div className="text-white font-bold text-sm">
                {isAuthenticated && (inboundFlightItem?.route || inboundFlightItem?.title)
                  ? (inboundFlightItem.route || inboundFlightItem.title)
                  : 'Kraków Airport (KRK)'}
              </div>
              <p className="text-slate-400 text-[11px] leading-snug">
                {isAuthenticated && inboundFlightItem?.confirmation_number ? (
                  <>Booking Confirmation: <strong className="text-emerald-300 font-mono">{inboundFlightItem.confirmation_number}</strong>.</>
                ) : (
                  <>Direct 17-minute SKA1 commuter rail from airport terminal into Kraków Główny central station.</>
                )}
              </p>
            </div>

            {/* Check-in Guidance */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1.5">
              <div className="text-emerald-300 font-bold uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Bed className="w-3.5 h-3.5 text-emerald-400" />
                <span>Lodging Arrival Sync</span>
              </div>
              <div className="text-white font-bold text-sm">
                Estimated Hotel Arrival: ~14:45 - 15:15
              </div>
              <p className="text-slate-400 text-[11px] leading-snug">
                13:30 landing + ~45m customs/bags + 17m direct SKA1 train to Kraków Główny. Directly matches standard 15:00 hotel check-in!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Base Recommendation & Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recommended Base Zone */}
        <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-wf-navy/90 flex flex-col justify-between shadow-xl space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <MapPin className="w-4 h-4" />
              <span>Recommended Neighborhood Zone</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {city.base}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Staying in or immediately bordering <strong className="text-amber-300">{city.base}</strong> ensures you can return on foot late at night after market festivities without needing taxi transfers or cold late-night tram waits.
            </p>

            <div className="pt-2 space-y-2">
              {hotelsList.map((hotel, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5 text-xs text-slate-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{hotel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => toggleItinerary(stayId)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer min-h-[38px] sm:min-h-[40px] flex-1 sm:flex-initial min-w-0 ${
                  isSaved
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">Saved Base</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">Save to Itinerary</span>
                  </>
                )}
              </button>
            )}

            <a
              href={mapSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 min-h-[38px] sm:min-h-[40px] flex-1 sm:flex-initial min-w-0"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Search Hotels on Maps</span>
            </a>
          </div>
        </div>

        {/* Transit & Station Connectivity */}
        <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-sky-500/30 bg-wf-navy/90 flex flex-col justify-between shadow-xl space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
              <Train className="w-4 h-4" />
              <span>Transit & Luggage Accessibility</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Station & Airport Proximity
            </h3>

            {city.transit ? (
              <div className="space-y-2.5 text-xs text-slate-200">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                  <div className="font-bold text-sky-300 flex items-center space-x-1.5">
                    <Train className="w-3.5 h-3.5 text-sky-400" />
                    <span>Train Hub:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{city.transit.station}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                  <div className="font-bold text-amber-300 flex items-center space-x-1.5">
                    <Navigation className="w-3.5 h-3.5 text-amber-400" />
                    <span>Airport Transfer:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed"><FormatText text={city.transit.airport} /></p>
                </div>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-slate-300">
                Direct walkable center with compact tram network accessible via the Jakdojade mobile app.
              </p>
            )}
          </div>

          {/* Winter Booking Tip */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start space-x-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-snug">
              <strong>Winter Peak Tip:</strong> December weekend rates near main squares surge rapidly. Book lodging with flexible cancellation 3-5 months ahead.
            </span>
          </div>
        </div>
      </div>

      {/* Confirmed Stay Booking Voucher Modal */}
      {isAuthenticated && confirmedStay && (
        <DocumentViewerModal
          isOpen={isStayDocViewerOpen}
          onClose={() => setIsStayDocViewerOpen(false)}
          doc={{
            id: confirmedStay.source_document_id || `hotel-${city.id}`,
            filename: confirmedStayDoc?.filename || confirmedStay.filename || confirmedStay.original_filename || `${hotelName.replace(/\s+/g, '_')}_Confirmation.pdf`,
            safe_display_name: confirmedStayDoc?.safe_display_name || `${hotelName} : Booking Confirmation`,
            mime_type: confirmedStayDoc?.mime_type || confirmedStay.mime_type || 'application/pdf',
            detected_doc_type: 'hotel',
            item_type: 'hotel',
            has_blob: Boolean(confirmedStayDoc?.has_blob || confirmedStay.source_document_id),
            file_url: confirmedStayDoc?.file_url || (confirmedStay.source_document_id ? `/api/wayfinder/documents/${encodeURIComponent(confirmedStay.source_document_id)}/file` : null),
            details: {
              confirmation: confirmationNumber,
              hotelName: hotelName,
              location: hotelAddress,
              checkIn: `${formatStayDate(checkInDate)} @ ${checkInTime}`,
              checkOut: `${formatStayDate(checkOutDate)} @ ${checkOutTime}`,
              roomType: roomType,
              guests: guests,
              totalCost: totalCost ? `${totalCost} ${currency}` : null,
              provider: confirmedStay.provider || 'Direct / Booking.com'
            }
          }}
        />
      )}

      {/* Uploaded Flight Document Preview Modal */}
      {isAuthenticated && inboundFlightDoc && (
        <DocumentViewerModal
          isOpen={isFlightDocViewerOpen}
          onClose={() => setIsFlightDocViewerOpen(false)}
          doc={inboundFlightDoc}
        />
      )}
    </div>
  );
}

export default CityHotelsTab;
