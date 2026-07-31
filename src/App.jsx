import React from 'react';
import { BudgetProvider, useBudget } from './context/BudgetContext';
import { AppLayout } from './components/AppLayout';
import { SettingsModal } from './components/SettingsModal';
import { DashboardView } from './components/DashboardView';
import { MainBudgetView } from './components/MainBudgetView';
import { LedgerView } from './components/LedgerView';
import { AmortizationView } from './components/AmortizationView';

function MainContent() {
  const { activeView } = useBudget();

  return (
    <>
      {activeView === 'dashboard'   && <DashboardView />}
      {activeView === 'main_budget' && <MainBudgetView />}
      {activeView === 'ledger'      && <LedgerView />}
      {activeView === 'amortization'&& <AmortizationView />}
      <SettingsModal />
    </>
  );
}

export default function App() {
  return (
    <BudgetProvider>
      <AppLayout>
        <MainContent />
      </AppLayout>
    </BudgetProvider>
  );
}
