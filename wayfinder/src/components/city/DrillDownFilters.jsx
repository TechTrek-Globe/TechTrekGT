import React, { useState } from 'react';
import { Utensils, Wine, GlassWater, Crown, Flame, Coins, Award, Coffee, ArrowLeft } from 'lucide-react';

export const RAW_FILTER_CATEGORIES = [
  { id: 'food-all', title: 'All Dining', Icon: Utensils, activeClass: 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  { id: 'must-haves', title: 'Must-Haves', Icon: Utensils, activeClass: 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/20', inactiveClass: 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10' },
  { id: 'local', title: 'Local Fares', Icon: Utensils, activeClass: 'bg-pink-500 text-white shadow-md shadow-pink-500/20', inactiveClass: 'bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30' },
  { id: 'steak', title: 'Steakhouses', Icon: Flame, activeClass: 'bg-rose-600 text-white shadow-md shadow-rose-500/20', inactiveClass: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30' },
  { id: 'cheap', title: 'Cheap Eats', Icon: Coins, activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20', inactiveClass: 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-300 border border-emerald-600/30' },
  { id: 'expensive', title: 'Fine Dining', Icon: Award, activeClass: 'bg-purple-600 text-white shadow-md shadow-purple-500/20', inactiveClass: 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border border-purple-600/30' },
  { id: 'coffee-breakfast', title: 'Coffee & Breakfast', Icon: Coffee, activeClass: 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },

  { id: 'drink-all', title: 'All Drinks', Icon: Wine, activeClass: 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400', inactiveClass: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30' },
  { id: 'pub-bars', title: 'Pubs & Bars', Icon: GlassWater, activeClass: 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  { id: 'vodka-house', title: 'Vodka Houses', Icon: Crown, activeClass: 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20', inactiveClass: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  { id: 'brewery', title: 'Breweries', Icon: GlassWater, activeClass: 'bg-amber-600 text-white shadow-md shadow-amber-600/20', inactiveClass: 'bg-amber-600/10 hover:bg-amber-600/20 text-amber-300 border border-amber-600/30' }
];

export function DrillDownFilters({ activeFilter, onFilterChange, items = [] }) {
  const [activeTier, setActiveTier] = useState('main'); // 'main', 'eat', 'drink'

  const eatCategories = ['food-all', 'must-haves', 'local', 'steak', 'cheap', 'expensive', 'coffee-breakfast'];
  const drinkCategories = ['drink-all', 'pub-bars', 'vodka-house', 'brewery'];

  const isEatCategory = (cat) => eatCategories.includes(cat);
  const isDrinkCategory = (cat) => drinkCategories.includes(cat);

  const getCount = (catId) => {
    if (catId === 'food-all') {
      return items.filter(i => ['must-haves', 'local', 'expensive', 'steak', 'cheap', 'coffee-breakfast'].includes(i.category)).length;
    }
    if (catId === 'drink-all') {
      return items.filter(i => ['vodka-house', 'brewery', 'historic-bar', 'pub', 'watering-hole', 'beer-hall', 'pub-bars'].includes(i.category)).length;
    }
    if (catId === 'pub-bars') {
      return items.filter(i => ['pub-bars', 'historic-bar', 'pub', 'watering-hole', 'beer-hall'].includes(i.category)).length;
    }
    return items.filter(i => i.category === catId).length;
  };

  const totalEat = getCount('food-all');
  const totalDrink = getCount('drink-all');

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full py-0.5">
      {activeTier === 'main' ? (
        <>
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer min-h-[36px] ${
              activeFilter === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            All Food & Drink ({items.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTier('eat');
              onFilterChange('food-all');
            }}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 cursor-pointer min-h-[36px] ${
              isEatCategory(activeFilter)
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Eat ({totalEat})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTier('drink');
              onFilterChange('drink-all');
            }}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 cursor-pointer min-h-[36px] ${
              isDrinkCategory(activeFilter)
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
            }`}
          >
            <Wine className="w-3.5 h-3.5" />
            <span>Drink ({totalDrink})</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setActiveTier('main');
              onFilterChange('all');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 flex items-center space-x-1.5 min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          {(activeTier === 'eat' ? eatCategories : drinkCategories).map((catId) => {
            const catDef = RAW_FILTER_CATEGORIES.find(c => c.id === catId);
            if (!catDef) return null;
            const count = getCount(catId);
            const Icon = catDef.Icon;
            const isActive = activeFilter === catId;
            return (
              <button
                key={catId}
                type="button"
                onClick={() => onFilterChange(catId)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer min-h-[36px] ${
                  isActive ? catDef.activeClass : catDef.inactiveClass
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{catDef.title} ({count})</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

export default DrillDownFilters;
