// @ts-nocheck
import React, { useMemo } from 'react';
import {
  BudgetMetadataProvider,
  useBudgetMetadataState,
  useBudgetMetadataDispatch
} from './BudgetMetadataContext';
import {
  LedgerDataProvider,
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
  const metadataState = useBudgetMetadataState();
  const metadataDispatch = useBudgetMetadataDispatch();
  const ledgerState = useLedgerDataState();
  const ledgerDispatch = useLedgerDataDispatch();

  return useMemo(() => ({
    ...metadataState,
    ...metadataDispatch,
    ...ledgerState,
    ...ledgerDispatch
  }), [metadataState, metadataDispatch, ledgerState, ledgerDispatch]);
}

