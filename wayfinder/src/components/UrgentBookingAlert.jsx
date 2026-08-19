import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Renders a high-visibility urgent booking / capacity warning banner.
 * Displayed inside MustSeeCard when sight.urgentAlert is set.
 */
export function UrgentBookingAlert({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 bg-red-950/80 border-l-4 border-red-500 text-red-200 p-3.5 rounded-r-lg mt-3">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-[11px] sm:text-xs font-semibold leading-snug">{message}</p>
    </div>
  );
}

export default UrgentBookingAlert;
