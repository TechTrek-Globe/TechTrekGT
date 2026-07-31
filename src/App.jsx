import React from 'react';
import { BudgetProvider, useBudget } from './context/BudgetContext';
import { AppLayout } from './components/AppLayout';
import { SettingsModal } from './components/SettingsModal';
import { DashboardView } from './components/DashboardView';
import { MainBudgetView } from './components/MainBudgetView';
import { InteractiveBudgetView } from './components/InteractiveBudgetView';
import { AccountLedgerView } from './components/AccountLedgerView';
import { AmortizationView } from './components/AmortizationView';

function MainContent() {
  const { activeView } = useBudget();

  return (
    <>
      {activeView === 'dashboard'          && <DashboardView />}
      {activeView === 'main_budget'        && <MainBudgetView />}
      {activeView === 'interactive_budget' && <InteractiveBudgetView />}
      {activeView === 'ledger'             && <AccountLedgerView />}
      {activeView === 'amortization'       && <AmortizationView />}
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
