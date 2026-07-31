import React from 'react';
import { BudgetProvider, useBudget } from './context/BudgetContext';
import { Navbar } from './components/Navbar';
import { SettingsModal } from './components/SettingsModal';
import { DashboardView } from './components/DashboardView';
import { MainBudgetView } from './components/MainBudgetView';
import { InteractiveBudgetView } from './components/InteractiveBudgetView';
import { AccountLedgerView } from './components/AccountLedgerView';
import { AmortizationView } from './components/AmortizationView';

function MainContent() {
  const { activeView } = useBudget();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {activeView === 'dashboard' && <DashboardView />}
      {activeView === 'main_budget' && <MainBudgetView />}
      {activeView === 'interactive_budget' && <InteractiveBudgetView />}
      {activeView === 'ledger' && <AccountLedgerView />}
      {activeView === 'amortization' && <AmortizationView />}
      <SettingsModal />
    </main>
  );
}

export default function App() {
  return (
    <BudgetProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
        <Navbar />
        <MainContent />
      </div>
    </BudgetProvider>
  );
}
