// @ts-nocheck
import React, { useMemo } from 'react';
import {
  BudgetMetadataProvider,
  useBudgetMetadata,
  useBudgetMetadataState,
  useBudgetMetadataDispatch
} from './BudgetMetadataContext';
import {
  LedgerDataProvider,
  useLedgerData,
  useLedgerDataState,
  useLedgerDataDispatch
} from './LedgerDataContext';

export {
  BudgetMetadataProvider,
  useBudgetMetadata,
  useBudgetMetadataState,
  useBudgetMetadataDispatch
} from './BudgetMetadataContext';
export {
  LedgerDataProvider,
  useLedgerData,
  useLedgerDataState,
  useLedgerDataDispatch
} from './LedgerDataContext';

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

  return useMemo(() => ({
    ...metadata,
    ...ledger
  }), [metadata, ledger]);
}

