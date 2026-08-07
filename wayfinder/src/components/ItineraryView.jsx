import React from 'react';
import { useWayfinder } from '../context/WayfinderContext';
import { CalendarClock, MapPin, Train, Building, Info, FileText } from 'lucide-react';

export function ItineraryView() {
  const { itinerary, isLoading } = useWayfinder();

  // Group by date string
  const grouped = [...itinerary].sort((a, b) => {
    const dateA = new Date(`${a.local_date}T${a.local_time || '00:00:00'}`);
    const dateB = new Date(`${b.local_date}T${b.local_time || '00:00:00'}`);
    return dateA - dateB;
  }).reduce((acc, item) => {
    const d = new Date(`${item.local_date}T00:00:00`);
    const dayStr = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    if (!acc[dayStr]) acc[dayStr] = [];
    acc[dayStr].push(item);
    return acc;
  }, {});

  const getIconForType = (type) => {
    switch (type) {
      case 'flight': return <MapPin className="w-4 h-4" />;
      case 'rail': return <Train className="w-4 h-4" />;
      case 'hotel': return <Building className="w-4 h-4" />;
      case 'booking': return <CalendarClock className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getStyleForType = (type) => {
    switch (type) {
      case 'flight': return 'bg-wf-blue/10 text-wf-blue-lt border-wf-blue/30';
      case 'rail': return 'bg-wf-amber/10 text-wf-amber border-wf-amber/30';
      case 'hotel': return 'bg-wf-evergreen/10 text-wf-evergreen border-wf-evergreen/30';
      default: return 'bg-white/5 text-white border-white/10';
    }
  };

  if (isLoading) {
    return <div className="text-center py-12 text-wf-muted">Loading itinerary...</div>;
  }

  return (
    <div className="space-y-12">
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-wf-muted bg-white/5 rounded-2xl border border-white/5">
          <p>No itinerary items found. Upload documents to auto-extract items, or wait for sync.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([dayStr, items], idx) => (
          <div key={dayStr} className="relative">
            <h3 className="text-lg font-bold text-white mb-6 sticky top-16 bg-wf-navy/90 backdrop-blur-md py-2 z-10 border-b border-white/10">
              {dayStr}
            </h3>
            <div className="space-y-4 pl-4 border-l-2 border-white/10 ml-2">
              {items.map((item) => {
                const timeStr = item.local_time ? new Date(`1970-01-01T${item.local_time}`).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'All Day';
                return (
                  <div key={item.id} className="relative group">
                    {/* Node */}
                    <div className={`absolute -left-[25px] top-4 w-4 h-4 rounded-full border-2 border-wf-navy-mid ${getStyleForType(item.item_type).split(' ')[1].replace('text', 'bg')}`} />
                    
                    <div className="glass-panel p-5 rounded-2xl border-l-4 hover-lift" style={{ borderLeftColor: 'currentColor' }}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg border ${getStyleForType(item.item_type)}`}>
                            {getIconForType(item.item_type)}
                          </div>
                          <span className="font-bold text-white text-lg">{item.title}</span>
                        </div>
                        <div className="text-wf-blue-lt font-mono font-medium">
                          {timeStr}
                        </div>
                      </div>
                      
                      <p className="text-wf-cream mb-3">{item.notes}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/10">
                        {item.provider && (
                          <div>
                            <div className="text-[10px] text-wf-muted uppercase tracking-wider">Provider</div>
                            <div className="text-sm text-white">{item.provider}</div>
                          </div>
                        )}
                      </div>
                      
                      {item.document_id && (
                        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-end">
                          <a 
                            href={`/wayfinder/poland-christmas-2026/private/documents?id=${item.document_id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              window.history.pushState({}, '', `/wayfinder/poland-christmas-2026/private/documents?id=${item.document_id}`);
                              window.dispatchEvent(new PopStateEvent('popstate'));
                            }}
                            className="text-xs font-medium text-wf-muted hover:text-white flex items-center transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" /> View Source Document
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
