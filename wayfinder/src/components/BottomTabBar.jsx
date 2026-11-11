import React from 'react';
import { MapPin, CalendarClock, Backpack, Coins, ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWayfinder } from '../context/WayfinderContext';

const BASE = '/wayfinder/poland-christmas-2026';

function TabItem({ icon: Icon, label, href, isActive, onClick, colorActive = 'text-amber-400', bgActive = 'bg-amber-500/15' }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 py-2 gap-0.5 rounded-xl transition-all min-h-[56px] ${
        isActive
          ? `${colorActive} ${bgActive}`
          : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive ? colorActive : ''}`} strokeWidth={isActive ? 2.5 : 2} />
      <span className={`text-[10px] font-bold tracking-wide leading-none ${isActive ? colorActive : ''}`}>
        {label}
      </span>
    </a>
  );
}

export function BottomTabBar({ currentPath, onOpenConverter }) {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const pathOnly = (currentPath || '').split('?')[0].split('#')[0].toLowerCase();
  const isDocs = pathOnly.includes('/documents');
  const isPacking = pathOnly.includes('/packing');
  const isSchedule = currentPath.includes('scroll=journey-sequence') || currentPath.includes('#journey-sequence') || (pathOnly.startsWith(`${BASE}/private`) && !isDocs && !isPacking);
  const isCities = !isSchedule && (pathOnly.startsWith(`${BASE}/cities`) || pathOnly === BASE || pathOnly === `${BASE}/` || pathOnly === '/wayfinder' || pathOnly === '/wayfinder/' || pathOnly === '/');
  const isPractical = pathOnly.startsWith(`${BASE}/practical`);
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();
  const { agendaAccess } = useWayfinder();
  const hubPath = agendaAccess.permissions.documents ? `${BASE}/private/documents` : `${BASE}/private`;

  const handleScheduleClick = (e) => {
    e.preventDefault();
    const isMain = pathOnly === BASE || pathOnly === `${BASE}/` || pathOnly === '/wayfinder' || pathOnly === '/wayfinder/' || pathOnly === '/';
    if (isMain) {
      const el = document.getElementById('journey-sequence');
      if (el) {
        const yOffset = -80;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        return;
      }
    }
    pushRoute(e, `${BASE}?scroll=journey-sequence`);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 safe-pb"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch gap-1 px-2 py-1.5">
        <TabItem
          icon={MapPin}
          label="Cities"
          href={BASE}
          isActive={isCities}
          onClick={(e) => pushRoute(e, BASE)}
        />
        <TabItem
          icon={CalendarClock}
          label="Schedule"
          href={`${BASE}?scroll=journey-sequence`}
          isActive={isSchedule}
          onClick={handleScheduleClick}
        />
        <TabItem
          icon={Backpack}
          label="Practical"
          href={`${BASE}/practical`}
          isActive={isPractical}
          onClick={(e) => pushRoute(e, `${BASE}/practical`)}
        />
        <button
          onClick={onOpenConverter}
          className="flex flex-col items-center justify-center flex-1 py-2 gap-0.5 rounded-xl text-slate-500 hover:text-amber-400 transition-all min-h-[56px]"
          aria-label="Open Currency Converter"
        >
          <Coins className="w-5 h-5" strokeWidth={2} />
          <span className="text-[10px] font-bold tracking-wide leading-none">Money</span>
        </button>
        {isAuthenticated ? (
          <TabItem
            icon={ShieldCheck}
            label="Hub"
            href={hubPath}
            isActive={isDocs || isPacking}
            onClick={(e) => pushRoute(e, hubPath)}
            colorActive="text-sky-400"
            bgActive="bg-sky-500/15"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-2 gap-0.5 rounded-xl text-slate-500 hover:text-sky-400 transition-all min-h-[56px]"
            aria-label="Sign in to access private travel hub"
          >
            <Lock className="w-5 h-5" strokeWidth={2} />
            <span className="text-[10px] font-bold tracking-wide leading-none">Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
}
