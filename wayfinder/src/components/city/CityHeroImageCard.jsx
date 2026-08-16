import React from 'react';

export function CityHeroImageCard({ 
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

export default CityHeroImageCard;
