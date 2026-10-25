import React from 'react';
import { 
  Plane, BedDouble, Utensils, Ticket, Train, FileText, Lock, MapPin 
} from 'lucide-react';

// Resolve theme colors per booking type
export function getBookingTheme(docType) {
  switch (docType) {
    case 'flight':     return { node: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]',     border: 'border-sky-500/40 group-hover:border-sky-400/70',   bg: 'bg-sky-950/25',      icon: 'bg-sky-500/15 text-sky-300 border-sky-500/30',      badge: 'bg-sky-500/20 text-sky-300 border-sky-400/40',   footer: 'border-sky-500/20',  time: 'text-sky-300' };
    case 'hotel':      return { node: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]', border: 'border-emerald-500/40 group-hover:border-emerald-400/70', bg: 'bg-emerald-950/25', icon: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40', footer: 'border-emerald-500/20', time: 'text-emerald-300' };
    case 'restaurant': return { node: 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]',  border: 'border-orange-500/40 group-hover:border-orange-400/70',  bg: 'bg-orange-950/25',  icon: 'bg-orange-500/15 text-orange-300 border-orange-500/30',  badge: 'bg-orange-500/20 text-orange-300 border-orange-400/40',  footer: 'border-orange-500/20',  time: 'text-orange-300' };
    case 'excursion':  return { node: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]', border: 'border-violet-500/40 group-hover:border-violet-400/70',  bg: 'bg-violet-950/25',  icon: 'bg-violet-500/15 text-violet-300 border-violet-500/30',  badge: 'bg-violet-500/20 text-violet-300 border-violet-400/40',  footer: 'border-violet-500/20',  time: 'text-violet-300' };
    case 'rail':       return { node: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',   border: 'border-amber-500/40 group-hover:border-amber-400/70',   bg: 'bg-amber-950/25',   icon: 'bg-amber-500/15 text-amber-300 border-amber-500/30',   badge: 'bg-amber-500/20 text-amber-300 border-amber-400/40',   footer: 'border-amber-500/20',   time: 'text-amber-300' };
    default:           return { node: 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.5)]',  border: 'border-white/20 group-hover:border-white/40',           bg: 'bg-slate-900/40',   icon: 'bg-white/10 text-slate-300 border-white/20',          badge: 'bg-white/10 text-slate-300 border-white/20',          footer: 'border-white/10',    time: 'text-slate-300' };
  }
}

export function getBookingIcon(docType) {
  switch (docType) {
    case 'flight':     return <Plane className="w-4 h-4" />;
    case 'hotel':      return <BedDouble className="w-4 h-4" />;
    case 'restaurant': return <Utensils className="w-4 h-4" />;
    case 'excursion':  return <Ticket className="w-4 h-4" />;
    case 'rail':       return <Train className="w-4 h-4" />;
    default:           return <FileText className="w-4 h-4" />;
  }
}

export function getBookingLabel(docType) {
  switch (docType) {
    case 'flight':     return 'Flight';
    case 'hotel':      return 'Hotel';
    case 'restaurant': return 'Dining';
    case 'excursion':  return 'Excursion';
    case 'rail':       return 'Rail';
    default:           return 'Booking';
  }
}

export function PrivateBookingCard({ item }) {
  const rawType = item.docType || item.detected_doc_type || item.item_type || 'booking';
  const docType = rawType === 'train' ? 'rail' : rawType;
  const theme = getBookingTheme(docType);

  // Resolve display-time field from normalized itinerary item
  const displayTime = item.time
    || item.departure_time || item.start_time || item.reservation_time || item.check_in_time
    || null;

  // Resolve location / venue for subtitle
  const displayLocation = item.location
    || item.hotel_name || item.restaurant_name || item.tour_name
    || item.origin_station || item.destination || null;

  // Extra metadata pills rendered in footer
  const footerPills = [];
  if (item.confirmation_number) footerPills.push({ label: 'Conf', value: item.confirmation_number, mono: true });
  if (item.passengers)          footerPills.push({ label: 'Pax', value: item.passengers, mono: false });
  if (item.guests || item.party_size) footerPills.push({ label: 'Guests', value: item.guests || item.party_size, mono: false });
  if (item.guest_name)          footerPills.push({ label: 'Guest', value: item.guest_name, mono: false });
  if (item.tickets)             footerPills.push({ label: 'Tickets', value: item.tickets, mono: false });
  if (item.check_in_date)       footerPills.push({ label: 'Check-in', value: item.check_in_date, mono: true });
  if (item.check_out_date)      footerPills.push({ label: 'Check-out', value: item.check_out_date, mono: true });
  if (item.meeting_point)       footerPills.push({ label: 'Meet', value: item.meeting_point, mono: false });
  if (item.duration)            footerPills.push({ label: 'Duration', value: item.duration, mono: false });

  return (
    <div className="relative group">
      {/* Colored node on vertical track */}
      <div className={`absolute -left-[23px] sm:-left-[31px] top-4 w-4 h-4 rounded-full border-2 border-slate-950 ${theme.node} group-hover:scale-125 transition-transform`} />

      <div className={`glass-panel p-4 sm:p-5 rounded-2xl border ${theme.border} transition-all shadow-md ${theme.bg} space-y-3`}>
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-xl border ${theme.icon} shrink-0`}>
              {getBookingIcon(docType)}
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="font-bold text-white text-base sm:text-lg leading-tight">
                  {item.title || item.tour_name || item.hotel_name || item.restaurant_name || `Private ${getBookingLabel(docType)}`}
                </h3>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center space-x-1 ${theme.badge}`}>
                  <Lock className="w-2.5 h-2.5" />
                  <span>Private</span>
                </span>
              </div>
              {displayLocation && item.title !== displayLocation && (
                <div className="text-xs text-slate-400 flex items-center space-x-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>{displayLocation}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-start sm:self-center">
            <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${theme.badge}`}>
              {getBookingLabel(docType)}
            </span>
            {displayTime && (
              <span className={`px-2.5 py-1 rounded-xl bg-slate-950 border border-white/10 font-mono font-bold text-xs ${theme.time}`}>
                {displayTime}
              </span>
            )}
          </div>
        </div>

        {/* Description / notes */}
        {item.description && (
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">{item.description}</p>
        )}

        {(item.website_url || item.phone || item.email) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {item.website_url && <a href={item.website_url} target="_blank" rel="noopener noreferrer" className="text-emerald-300 hover:text-white underline">Website</a>}
            {item.phone && <a href={`tel:${item.phone}`} className="text-emerald-300 hover:text-white underline">{item.phone}</a>}
            {item.email && <a href={`mailto:${item.email}`} className="text-emerald-300 hover:text-white underline">{item.email}</a>}
          </div>
        )}

        {/* Metadata footer pills */}
        {footerPills.length > 0 && (
          <div className={`pt-2 border-t ${theme.footer} flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]`}>
            {footerPills.map((pill, i) => (
              <span key={i} className="flex items-center space-x-1">
                <span className="text-wf-muted">{pill.label}:</span>
                <span className={pill.mono ? `${theme.time} font-mono font-semibold` : 'text-slate-300'}>{pill.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
