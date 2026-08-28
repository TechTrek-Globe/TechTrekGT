import React from 'react';
import {
  DollarSign,
  TrendingUp,
  ReceiptText,
  Calculator,
  ShieldCheck,
  Zap,
  ArrowRight,
  Sparkles,
  Layers,
  BarChart3,
  Lock,
  Globe,
  CheckCircle2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

export function LandingPage({ onNavigate }) {
  const handleFinanceClick = (e) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate('/finance');
    } else {
      window.location.href = '/finance';
    }
  };

  const featureCards = [
    {
      icon: TrendingUp,
      title: 'Bi-Weekly Payday Matrix',
      description: 'Synchronize multi-earner cash inflows with precision calendar math and custom pay offsets.'
    },
    {
      icon: ReceiptText,
      title: 'Dynamic Bill Splits',
      description: 'Weighted proportional expense splits between partners with granular account-level tracking.'
    },
    {
      icon: Calculator,
      title: 'Loan Amortization Engine',
      description: 'Model principal paydowns, extra contribution simulations, and interest savings over time.'
    },
    {
      icon: ShieldCheck,
      title: 'Local-First Security',
      description: 'Native browser origin sandboxing, zero cloud footprint, and local IndexedDB database persistence.'
    }
  ];

  const ecosystemCards = [
    {
      title: 'Local IndexedDB Engine',
      category: 'Persistence',
      badge: 'Active',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      description: 'Native asynchronous IndexedDB database engine for 100% offline client-side storage.'
    },
    {
      title: 'TechTrek Analytics',
      category: 'Intelligence',
      badge: 'Active',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      description: 'Real-time telemetry, visual metrics dashboards, and distributed audit logging pipelines.'
    },
    {
      title: 'TechTrek Security Gateway',
      category: 'Protection',
      badge: 'Protected',
      badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      description: 'Strict origin sandboxing ensuring all financial records remain exclusively on client device.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500 selection:text-white flex flex-col font-sans">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl" />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="https://techtrekgt.com" className="flex items-center space-x-3 group" title="Go to TechTrekGT Main Launch Pad">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white">TechTrek<span className="text-blue-400">GT</span></span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold bg-slate-800 text-slate-300 rounded-full border border-slate-700">Launch Pad</span>
            </div>
          </a>

          <div className="flex items-center space-x-4">
            <a
              href="/finance"
              onClick={handleFinanceClick}
              className="group flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Launch Finance</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 relative z-10 w-full">
        {/* Top Hero Banner */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>TechTrek Enterprise Application Suite</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-white mb-6">
            Precision Edge Solutions for{' '}
            <span className="gradient-text">TechTrekGT</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Centralized hub for TechTrek systems, distributed cloud applications, and high-performance financial management.
          </p>
        </div>

        {/* PROMINENT FEATURE TILE: TechTrek Finance */}
        <div className="mb-16">
          <div className="relative group">
            {/* Outer gradient glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 rounded-3xl opacity-75 blur-xl group-hover:opacity-100 transition duration-500" />

            <div className="relative rounded-3xl bg-slate-900/90 border border-slate-700/80 p-8 sm:p-10 lg:p-12 shadow-2xl backdrop-blur-xl">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                
                {/* Tile Left Content */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full">
                      Primary Application
                    </span>
                    <span className="px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live on /finance
                    </span>
                  </div>

                  <div>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
                      <DollarSign className="w-8 h-8 text-blue-400" />
                      TechTrek Finance
                    </h2>
                    <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
                      Comprehensive personal budget, bi-weekly cash flow matrix, and automated expense-splitting engine built for households and multi-earner planning.
                    </p>
                  </div>

                  {/* Feature Checklist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Bi-Weekly Payday Schedule Engine</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Multi-Account Cash Allocations</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Interactive Loan Amortization</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Local-First JSON Backup &amp; Restore</span>
                    </div>
                  </div>

                  {/* Tile Primary Action */}
                  <div className="pt-4 flex flex-wrap items-center gap-4">
                    <a
                      href="/finance"
                      onClick={handleFinanceClick}
                      className="inline-flex items-center space-x-3 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>Open TechTrek Finance</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>

                    <span className="text-xs text-slate-400 font-mono">
                      Path: <span className="text-blue-300">/finance</span>
                    </span>
                  </div>
                </div>

                {/* Tile Right Preview Card */}
                <div className="lg:col-span-5">
                  <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-inner space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-xs font-semibold text-slate-300">Dashboard Metrics Preview</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/50">Edge Verified</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Monthly Inflow</div>
                        <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">$9,850.00</div>
                        <div className="text-[10px] text-emerald-500/80 mt-1">Split Calibrated</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Monthly Outflow</div>
                        <div className="text-base font-bold text-rose-400 font-mono mt-0.5">$5,420.00</div>
                        <div className="text-[10px] text-rose-500/80 mt-1">18 Recurring Bills</div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-400">Monthly Net Savings</div>
                        <div className="text-lg font-black text-blue-400 font-mono">+$4,430.00</div>
                      </div>
                      <div className="px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">
                        45.0% Rate
                      </div>
                    </div>

                    <a
                      href="/finance"
                      onClick={handleFinanceClick}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <span>Explore Dashboard Views</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mb-16">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="text-xl sm:text-2xl font-bold text-white">Finance Architecture Capabilities</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Engineered for speed, mathematical correctness, and multi-user privacy.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featureCards.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all hover:-translate-y-1 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-2">{feat.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{feat.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* TechTrek Platform Ecosystem */}
        <div>
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="text-xl sm:text-2xl font-bold text-white">TechTrekGT Ecosystem</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Platform modules and integrated services.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ecosystemCards.map((card, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{card.category}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white mb-2">{card.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{card.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 bg-slate-950/80 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>TechTrekGT Cloud Platform</span>
          </div>
          <div>
            <span>&copy; {new Date().getFullYear()} TechTrekGT. All rights reserved.</span>
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="/finance"
              onClick={handleFinanceClick}
              className="text-slate-400 hover:text-blue-400 transition-colors"
            >
              Finance Dashboard (/finance)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
