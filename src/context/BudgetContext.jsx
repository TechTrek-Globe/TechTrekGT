// @ts-nocheck
import React from 'react';
import { BudgetMetadataProvider, useBudgetMetadata } from './BudgetMetadataContext';
import { LedgerDataProvider, useLedgerData } from './LedgerDataContext';

export { BudgetMetadataProvider, useBudgetMetadata } from './BudgetMetadataContext';
export { LedgerDataProvider, useLedgerData } from './LedgerDataContext';

export function BudgetProvider({ children }) {
  return (
    <BudgetMetadataProvider>
      <LedgerDataProvider>
        {children}
      </LedgerDataProvider>
    </BudgetMetadataProvider>
  );
}

export function useBudget() {
  const metadata = useBudgetMetadata();
  const ledger = useLedgerData();

  return {
    ...metadata,
    ...ledger
  };
}
