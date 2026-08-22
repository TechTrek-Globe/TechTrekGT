import React from 'react';
import { STATUS_META } from '../../utils/constants';

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META['Available'];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${m.color} ${m.bg} border ${m.border}`}>
      {status}
    </span>
  );
}
