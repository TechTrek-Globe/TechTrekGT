import React, { useState } from 'react';
import { 
  Plane, BedDouble, Utensils, Ticket, Train, FileText, Lock, MapPin, AlertTriangle, ExternalLink, CheckCircle2 
} from 'lucide-react';
import { DocumentViewerModal } from '../DocumentViewerModal';
import { useSettings } from '../../context/SettingsContext';
import { formatTime } from '../Formatters';

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

export function parseBookingMetadata(item) {
  const rawNotes = item?.notes || '';
  // Normalize both literal '\n' and actual newlines
  const normalized = String(rawNotes)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const fields = {};
  const narrativeLines = [];

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = trimmed.match(/^([A-Za-z0-9\s_-]+):\s*(.*)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const val = m[2].trim();
      fields[key] = val;
    } else {
      const lower = trimmed.toLowerCase();
      if (!lower.startsWith('source:') && !lower.startsWith('from:') && !lower.startsWith('cost:')) {
        narrativeLines.push(trimmed);
      }
    }
  }

  const rawType = (item?.docType || item?.detected_doc_type || item?.item_type || '').toLowerCase();
  const isHotel = rawType === 'hotel' || rawType === 'accommodation' || rawType === 'lodging';

  const confNumber = item?.confirmation_number || fields['confirmation'] || fields['booking reference'] || item?.booking_reference || null;
  const supplier = isHotel ? null : (item?.supplier || fields['supplier'] || fields['operator'] || null);
  const pickupWindow = isHotel ? null : (item?.pickup_window || fields['pickup window'] || fields['pickup'] || null);
  
  let bagRestriction = null;
  if (!isHotel) {
    bagRestriction = item?.bag_restriction || fields['bag restrictions'] || fields['bag restriction'] || null;
    if (!bagRestriction && normalized.includes('30x20x10')) {
      bagRestriction = 'Max 30x20x10 cm on Museum grounds';
    }
  }

  let rawTickets = isHotel ? null : (item?.tickets || fields['tickets'] || null);
  let rawDuration = isHotel ? null : (item?.duration || fields['duration'] || null);

  if (rawTickets) {
    const durM = rawTickets.match(/(\d+\s*(?:hours|hrs|hr))/i);
    if (durM && !rawDuration) {
      rawDuration = durM[1];
    }
    rawTickets = rawTickets.replace(/\s*[-•]\s*\d+\s*(?:hours|hrs|hr)/i, '').trim();
  }

  let mobileTicketUrl = null;
  let activityDetailsUrl = null;

  if (!isHotel) {
    const isGyg = (item?.provider || '').toLowerCase().includes('getyourguide') ||
                  (item?.title || '').toLowerCase().includes('getyourguide') ||
                  normalized.toLowerCase().includes('getyourguide') ||
                  rawType === 'excursion' ||
                  (confNumber && confNumber.startsWith('GYG'));

    mobileTicketUrl = item?.mobile_ticket_url || fields['mobile tickets'] || fields['mobile ticket'] || null;
    activityDetailsUrl = item?.activity_details_url || fields['activity details'] || fields['activity detail'] || null;

    if (isGyg) {
      const rawRef = item?.booking_reference || fields['booking reference'] || (confNumber && !confNumber.startsWith('GYG') ? confNumber : null) || '6ICXW284P0LJK9OYS594M5NZKD52BTFT';
      const gygBookingRef = rawRef;

      if (mobileTicketUrl && mobileTicketUrl.includes('adj_fallback=')) {
        const fb = mobileTicketUrl.match(/adj_fallback=([^&]+)/i);
        if (fb) {
          const decoded = decodeURIComponent(fb[1]);
          mobileTicketUrl = decoded;
          activityDetailsUrl = decoded;
        }
      } else if (mobileTicketUrl && (mobileTicketUrl.includes('adj.st') || mobileTicketUrl.includes('getyourguide.com'))) {
        mobileTicketUrl = `https://www.getyourguide.com/booking/${gygBookingRef}?partner_id=931BMKV&visitor_id=H2Z77FVCVCDZ2HHK7HDV52IYZU3RF8IL`;
        activityDetailsUrl = `https://www.getyourguide.com/booking/${gygBookingRef}?partner_id=931BMKV&visitor_id=H2Z77FVCVCDZ2HHK7HDV52IYZU3RF8IL`;
      } else if (!mobileTicketUrl && gygBookingRef) {
        mobileTicketUrl = `https://www.getyourguide.com/booking/${gygBookingRef}?partner_id=931BMKV&visitor_id=H2Z77FVCVCDZ2HHK7HDV52IYZU3RF8IL`;
        activityDetailsUrl = `https://www.getyourguide.com/booking/${gygBookingRef}?partner_id=931BMKV&visitor_id=H2Z77FVCVCDZ2HHK7HDV52IYZU3RF8IL`;
      }
    } else {
      if (mobileTicketUrl && (mobileTicketUrl.includes('adj.st') || mobileTicketUrl.includes('getyourguide.com'))) {
        mobileTicketUrl = null;
      }
      if (activityDetailsUrl && (activityDetailsUrl.includes('adj.st') || activityDetailsUrl.includes('getyourguide.com'))) {
        activityDetailsUrl = null;
      }
    }
  }

  // Clean narrative description: never dump raw metadata keys!
  let description = narrativeLines.join(' ').trim();
  if (!description || description.length < 5 || description.includes(':\n') || description.includes(':')) {
    const titleLower = (item?.title || '').toLowerCase();
    if (titleLower.includes('auschwitz') && (titleLower.includes('wieliczka') || titleLower.includes('salt'))) {
      description = 'Full-day educator-guided memorial visit to Auschwitz-Birkenau and UNESCO underground Wieliczka Salt Mine with Krakow hotel pickup and drop-off.';
    } else if (titleLower.includes('auschwitz')) {
      description = 'Official educator-guided memorial tour of Auschwitz I and Auschwitz II-Birkenau camps with transportation.';
    } else if (titleLower.includes('wieliczka')) {
      description = 'Guided exploration of the historic subterranean salt mine, underground saline lakes, and the Chapel of St. Kinga.';
    } else if (titleLower.includes('flight') || (item?.docType || item?.item_type) === 'flight') {
      description = 'Delta Air Lines international inbound flight service to Poland via Amsterdam Schiphol.';
    } else {
      description = null;
    }
  }

  return {
    confNumber,
    supplier,
    pickupWindow,
    bagRestriction,
    rawTickets,
    rawDuration,
    mobileTicketUrl,
    activityDetailsUrl,
    description,
    fields,
  };
}

export function PrivateBookingCard({ item, reorderControls }) {
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
  const rawType = item.docType || item.detected_doc_type || item.item_type || 'booking';
  const docType = rawType === 'train' ? 'rail' : rawType;
  const theme = getBookingTheme(docType);

  // Robust structured metadata parsing
  const meta = parseBookingMetadata(item);

  const { settings } = useSettings();
  const timeFormat = settings?.timeFormat || '12h';

  // Resolve display-time field from normalized itinerary item
  const rawStart = item.local_time || item.time
    || item.departure_time || item.start_time || item.reservation_time || item.check_in_time
    || null;
  const rawEnd = item.end_time || null;
  const formattedStart = rawStart ? formatTime(rawStart, timeFormat) : null;
  const formattedEnd = rawEnd ? formatTime(rawEnd, timeFormat) : null;
  let displayTime = formattedStart;
  if (formattedStart && formattedEnd) {
    displayTime = `${formattedStart} - ${formattedEnd}${meta.rawDuration ? ` (${meta.rawDuration})` : ''}`;
  } else if (formattedStart && meta.rawDuration) {
    displayTime = `${formattedStart} (${meta.rawDuration})`;
  }

  // Resolve location / venue for subtitle
  const displayLocation = item.location
    || item.hotel_name || item.restaurant_name || item.tour_name
    || item.origin_station || item.destination || null;

  // Extra metadata pills rendered in footer
  const footerPills = [];
  if (meta.confNumber) footerPills.push({ label: 'Conf', value: meta.confNumber, mono: true });
  if (item.provider)   footerPills.push({ label: 'Provider', value: item.provider, mono: false });
  if (meta.supplier && !item.provider?.toLowerCase().includes(meta.supplier.toLowerCase())) {
    footerPills.push({ label: 'Operator', value: meta.supplier, mono: false });
  }
  if (meta.pickupWindow) footerPills.push({ label: 'Pickup Window', value: meta.pickupWindow, mono: true });
  if (item.passengers)   footerPills.push({ label: 'Pax', value: item.passengers, mono: false });
  if (item.guests || item.party_size) footerPills.push({ label: 'Guests', value: item.guests || item.party_size, mono: false });
  if (item.guest_name)   footerPills.push({ label: 'Guest', value: item.guest_name, mono: false });
  if (meta.rawTickets)   footerPills.push({ label: 'Tickets', value: meta.rawTickets, mono: false });
  if (item.check_in_date) footerPills.push({ label: 'Check-in', value: item.check_in_date, mono: true });
  if (item.check_out_date) footerPills.push({ label: 'Check-out', value: item.check_out_date, mono: true });
  if (item.meeting_point) footerPills.push({ label: 'Meet', value: item.meeting_point, mono: false });
  if (meta.rawDuration)  footerPills.push({ label: 'Duration', value: meta.rawDuration, mono: false });
  const purchaseSite = item.purchase_site || meta.fields?.['purchase_site'] || meta.fields?.['purchase site'] || meta.fields?.['site'] || meta.fields?.['platform'];
  const paymentMethod = item.payment_method || meta.fields?.['payment_method'] || meta.fields?.['payment method'] || meta.fields?.['payment'];
  if (purchaseSite)  footerPills.push({ label: 'Purchased At', value: purchaseSite, mono: false });
  if (paymentMethod) footerPills.push({ label: 'Payment', value: paymentMethod, mono: false });

  // Clean narrative description (never dumps internal metadata fields)
  const displayDescription = item.description || meta.description;

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
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(displayLocation)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-slate-400 hover:text-amber-300 flex items-center space-x-1 mt-0.5 transition-colors group/loc cursor-pointer inline-flex max-w-fit"
                  title="Open navigation directions in Google Maps"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 group-hover/loc:scale-110 transition-transform" />
                  <span className="underline decoration-slate-600 hover:decoration-amber-400 underline-offset-2">
                    {displayLocation}
                  </span>
                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover/loc:text-amber-300 opacity-70 ml-0.5 shrink-0" />
                </a>
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
            {reorderControls}
          </div>
        </div>

        {/* Description / notes */}
        {displayDescription && (
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">{displayDescription}</p>
        )}

        {/* Museum Bag Restrictions Alert Banner */}
        {meta.bagRestriction && (
          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200/90 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Bag Restriction:</strong>{' '}
              <span>Strict limit of 30×20×10 cm permitted on memorial grounds. Larger backpacks and luggage must remain safely locked inside the tour bus.</span>
            </div>
          </div>
        )}

        {/* Confirmed Excursion Banner */}
        {docType === 'excursion' && (
          <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200/90 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-emerald-300">Confirmed Excursion:</strong> Replaces generic day trip ideas. All-day guided excursion ({displayTime || (timeFormat === '24h' ? '06:30 - 17:30' : '6:30 AM - 5:30 PM')}).
            </span>
          </div>
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

        {/* Document & Mobile Ticket Actions */}
        {(meta.mobileTicketUrl || item.source_document_id || item.filename || docType === 'flight' || item.confirmation_number === 'GUDI3J') && (
          <div className={`pt-2.5 border-t ${theme.footer} flex flex-wrap items-center justify-between gap-2`}>
            <div className="flex flex-wrap items-center gap-2">
              {meta.mobileTicketUrl && (
                <a
                  href={meta.mobileTicketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <Ticket className="w-3.5 h-3.5 text-slate-950" />
                  <span>Open Mobile Tickets</span>
                  <ExternalLink className="w-3 h-3 text-slate-950" />
                </a>
              )}
              {(item.source_document_id || item.filename || docType === 'flight' || item.confirmation_number === 'GUDI3J') && (
                <button
                  type="button"
                  onClick={() => setIsDocViewerOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>View Attached {docType === 'flight' ? 'Flight Document' : docType === 'hotel' ? 'Booking Confirmation (PDF)' : 'Ticket (PDF)'}</span>
                </button>
              )}
            </div>

            {meta.activityDetailsUrl && (
              <a
                href={meta.activityDetailsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-sky-300 hover:text-white underline font-medium inline-flex items-center space-x-1"
              >
                <span>Activity Details</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}

            {item.confirmation_number === 'GUDI3J' && !meta.mobileTicketUrl && (
              <span className="text-[11px] text-slate-400">
                Delta Confirmation: <strong className="text-emerald-300 font-mono">GUDI3J</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Universal Document Preview Modal */}
      <DocumentViewerModal
        isOpen={isDocViewerOpen}
        onClose={() => setIsDocViewerOpen(false)}
        doc={{
          id: item.source_document_id || (docType === 'excursion' ? 'doc-gyg-7vkk692wy' : 'delta-poland-2026'),
          filename: item.filename || (docType === 'excursion' ? 'GetYourGuide_Ticket_GYG7VKK692WY.pdf' : (docType === 'flight' ? 'Poland_Delta.pdf' : (item.title || 'Booking Voucher'))),
          safe_display_name: item.title || 'Booking Confirmation',
          file_url: (docType === 'excursion' || (item.title || '').toLowerCase().includes('auschwitz'))
            ? `${(import.meta.env.BASE_URL || '/wayfinder/').replace(/\/$/, '')}/Poland-2026/docs/GetYourGuide_Ticket_GYG7VKK692WY.pdf`
            : (docType === 'flight' || (item.title || '').toLowerCase().includes('delta'))
            ? `${(import.meta.env.BASE_URL || '/wayfinder/').replace(/\/$/, '')}/Poland-2026/docs/Poland_Delta.pdf`
            : ((item.title || '').toLowerCase().includes('altus'))
            ? `${(import.meta.env.BASE_URL || '/wayfinder/').replace(/\/$/, '')}/Poland-2026/docs/Hotel_Altus_Palace_Wroclaw_Confirmation.pdf`
            : null,
          details: {
            confirmation: item.confirmation_number || meta.confNumber || (docType === 'excursion' ? 'GYG7VKK692WY' : ''),
            provider: item.provider || (docType === 'excursion' ? 'GetYourGuide / Mr.Shuttle' : item.title),
            supplier: meta.supplier || (docType === 'excursion' ? 'Mr.Shuttle' : null),
            schedule: item.local_date ? `${item.local_date} ${rawStart || '06:30'}` : null,
            pickupWindow: meta.pickupWindow || (docType === 'excursion' ? '05:30 - 07:30' : null),
            bagRestriction: meta.bagRestriction || (docType === 'excursion' ? 'Max 30x20x10 cm on Museum grounds' : null),
            location: item.location || displayLocation || (docType === 'excursion' ? 'Hotel Pickup (Kraków)' : ''),
            passengers: item.passengers || (meta.rawTickets || '2 Adults'),
            flightLeg: docType === 'flight' ? 'DL9208 (AMS -> KRK)' : null,
            touchdown: docType === 'flight' ? 'Dec 4, 2026 at 13:30 CET (Local Poland Time)' : null,
            originLeg: docType === 'flight' ? 'DL0074 (ATL -> AMS, departs Dec 3 at 20:10 EST)' : null,
            layover: docType === 'flight' ? '55 minutes at Amsterdam (AMS)' : null,
            lodgingSync: docType === 'flight' ? 'Arrives in Krakow Old Town/Kazimierz at ~14:45-15:15 CET, synchronizing with standard 15:00 check-in.' : null
          }
        }}
      />
    </div>
  );
}
