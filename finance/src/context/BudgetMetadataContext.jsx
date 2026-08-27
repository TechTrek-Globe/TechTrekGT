// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initialBudgetData, DEFAULT_DASHBOARD_WIDGETS } from '../initialData';
import { useAuth } from './AuthContext';
import { isPersonDepositDay, getPersonDepositAmountForAccount, getAccountSaveExtraPersonPortion, getNextBillDueDate } from '../utils/paydayUtils';
import { getApiUrl } from '../utils/api';
import { getBudgetData } from '../utils/indexedDB';
import { 
  getDebugEnabled, 
  setDebugEnabled, 
  getCategoryStates, 
  setCategoryEnabled, 
  setAllCategories, 
  resetCategoryDefaults, 
  subscribeToDebugLogs, 
  logDebug, 
  logInfo,
  logLedger,
  logMatrix,
  logTransaction,
  logState
} from '../utils/logger';

export const BudgetMetadataContext = createContext(null);
export const BudgetMetadataStateContext = createContext(null);
export const BudgetMetadataDispatchContext = createContext(null);

const STORAGE_KEY = 'personal_budget_app_data_v1';

export function BudgetMetadataProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [selectedPersonId, setSelectedPersonId] = useState(() => {
    try { return localStorage.getItem('trekledger_selected_person_id') || 'all'; }
    catch { return 'all'; }
  });

  const [metadataState, setMetadataState] = useState({
    accounts: initialBudgetData.accounts || [],
    people: initialBudgetData.people || [],
    bills: initialBudgetData.bills || [],
    loans: initialBudgetData.loans || [],
    dashboardWidgets: initialBudgetData.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS,
    theme: initialBudgetData.theme || 'dark',
    hideDashboardHeader: Boolean(initialBudgetData.hideDashboardHeader)
  });

  const [initialLedgerSeed, setInitialLedgerSeed] = useState({
    dailyMatrix: initialBudgetData.dailyMatrix || {},
    lineItems: initialBudgetData.lineItems || [],
    transactions: initialBudgetData.transactions || []
  });

  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('accounts');

  // Debug Logging State & Real-time Subscription
  const [isDebugMode, setIsDebugModeState] = useState(() => getDebugEnabled());
  const [categoryStates, setCategoryStatesState] = useState(() => getCategoryStates());
  const [debugLogs, setDebugLogs] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToDebugLogs((event) => {
      if (event.type === 'STATUS_CHANGE') {
        setIsDebugModeState(event.isDebugEnabled);
        if (event.categoryStates) setCategoryStatesState(event.categoryStates);
      } else if (event.type === 'CATEGORIES_CHANGE') {
        if (event.categoryStates) setCategoryStatesState(event.categoryStates);
      } else if (event.type === 'LOG_ENTRY') {
        setDebugLogs(prev => [event.entry, ...prev].slice(0, 500));
      }
    });
    return unsubscribe;
  }, []);

  const setDebugMode = useCallback((enabled) => {
    const boolVal = Boolean(enabled);
    setDebugEnabled(boolVal);
    setIsDebugModeState(boolVal);
    if (boolVal) {
      logInfo('SYSTEM', 'Verbose debug mode activated');
    }
  }, []);

  const toggleCategory = useCallback((catKey, enabled) => {
    setCategoryEnabled(catKey, enabled);
  }, []);

  const enableAllCategories = useCallback(() => {
    setAllCategories(true);
  }, []);

  const disableAllCategories = useCallback(() => {
    setAllCategories(false);
  }, []);

  const resetCategories = useCallback(() => {
    resetCategoryDefaults();
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  const addDebugLog = useCallback((category, message, payload, level) => {
    logDebug(category, message, payload, level);
  }, []);

  const metadataStateRef = useRef(metadataState);
  metadataStateRef.current = metadataState;

  useEffect(() => {
    try { localStorage.removeItem('trekledger_active_view'); }
    catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('trekledger_selected_person_id', selectedPersonId); }
    catch { /* ignore */ }
  }, [selectedPersonId]);

  // Load initial data from IndexedDB or legacy localStorage
  useEffect(() => {
    async function initLocalStorageOrIndexedDB() {
      try {
        const stored = await getBudgetData();
        if (stored && typeof stored === 'object') {
          setMetadataState({
            accounts: Array.isArray(stored.accounts) ? stored.accounts : initialBudgetData.accounts,
            people: Array.isArray(stored.people) ? stored.people : initialBudgetData.people,
            bills: Array.isArray(stored.bills) ? stored.bills : initialBudgetData.bills,
            loans: Array.isArray(stored.loans) ? stored.loans : initialBudgetData.loans,
            dashboardWidgets: Array.isArray(stored.dashboardWidgets)
              ? (() => {
                  const existingIds = new Set(stored.dashboardWidgets.map(w => w.id));
                  const missing = DEFAULT_DASHBOARD_WIDGETS.filter(w => !existingIds.has(w.id));
                  return [...stored.dashboardWidgets, ...missing];
                })()
              : DEFAULT_DASHBOARD_WIDGETS,
            theme: stored.theme || 'dark',
            hideDashboardHeader: Boolean(stored.hideDashboardHeader)
          });

          setInitialLedgerSeed({
            dailyMatrix: (stored.dailyMatrix && typeof stored.dailyMatrix === 'object') ? stored.dailyMatrix : {},
            lineItems: Array.isArray(stored.lineItems) ? stored.lineItems : [],
            transactions: Array.isArray(stored.transactions) ? stored.transactions : []
          });
        } else {
          // Check for legacy localStorage data
          const legacy = localStorage.getItem(STORAGE_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy);
            if (parsed && typeof parsed === 'object') {
              setMetadataState({
                accounts: Array.isArray(parsed.accounts) ? parsed.accounts : initialBudgetData.accounts,
                people: Array.isArray(parsed.people) ? parsed.people : initialBudgetData.people,
                bills: Array.isArray(parsed.bills) ? parsed.bills : initialBudgetData.bills,
                loans: Array.isArray(parsed.loans) ? parsed.loans : initialBudgetData.loans,
                dashboardWidgets: Array.isArray(parsed.dashboardWidgets)
                  ? parsed.dashboardWidgets
                  : DEFAULT_DASHBOARD_WIDGETS,
                theme: parsed.theme || 'dark',
                hideDashboardHeader: Boolean(parsed.hideDashboardHeader)
              });

              setInitialLedgerSeed({
                dailyMatrix: (parsed.dailyMatrix && typeof parsed.dailyMatrix === 'object') ? parsed.dailyMatrix : {},
                lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
                transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
              });
              localStorage.removeItem(STORAGE_KEY);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load metadata from IndexedDB:', err);
      } finally {
        setIsDbLoaded(true);
      }
    }

    initLocalStorageOrIndexedDB();
  }, []);

  // Auto Cloud Backup State & Control (defaults to true for authenticated users)
  const [isAutoCloudBackupEnabled, setIsAutoCloudBackupEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('cf_auto_backup_enabled');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  // Sync on Load State & Control (defaults to true for authenticated users)
  const [isSyncOnLoadEnabled, setIsSyncOnLoadEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('cf_sync_on_load_enabled');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const [lastCloudSyncTime, setLastCloudSyncTime] = useState(null);

  const toggleAutoCloudBackup = useCallback((enableBool) => {
    const val = Boolean(enableBool);
    try { localStorage.setItem('cf_auto_backup_enabled', String(val)); }
    catch {}
    setIsAutoCloudBackupEnabled(val);
  }, []);

  const toggleSyncOnLoad = useCallback((enableBool) => {
    const val = Boolean(enableBool);
    try { localStorage.setItem('cf_sync_on_load_enabled', String(val)); }
    catch {}
    setIsSyncOnLoadEnabled(val);
  }, []);

  // Account Operations
  const addAccount = useCallback((accountData) => {
    const newAcc = {
      id: accountData.id || `acc-${Date.now()}`,
      name: accountData.name || 'New Account',
      type: accountData.type || 'checking',
      saveExtraMonthly: parseFloat(accountData.saveExtraMonthly) || 0,
      enableExtraSavings: accountData.enableExtraSavings ?? true,
      color: accountData.color || 'blue',
      notes: accountData.notes || '',
      ledgerMode: accountData.ledgerMode || (accountData.importedLedgerRows && Object.keys(accountData.importedLedgerRows).length > 0 ? 'import' : 'manual'),
      importedLedgerRows: accountData.importedLedgerRows || {}
    };
    logLedger('ADD_ACCOUNT', `Added new account: "${newAcc.name}" (${newAcc.type})`, { account: newAcc });
    setMetadataState(prev => ({
      ...prev,
      accounts: [...prev.accounts, newAcc]
    }));
    return newAcc;
  }, []);

  const updateAccount = useCallback((id, updatedData) => {
    logLedger('UPDATE_ACCOUNT', `Updated account: ${id}`, { id, updatedData });
    setMetadataState(prev => ({
      ...prev,
      accounts: prev.accounts.map(acc => acc.id === id ? { ...acc, ...updatedData } : acc)
    }));
  }, []);

  const deleteAccount = useCallback((id) => {
    logLedger('DELETE_ACCOUNT', `Deleted account: ${id}`, { id });
    setMetadataState(prev => ({
      ...prev,
      accounts: prev.accounts.filter(acc => acc.id !== id),
      bills: prev.bills.map(b => b.accountId === id ? { ...b, accountId: prev.accounts.find(a => a.id !== id)?.id || '' } : b)
    }));
  }, []);

  // Person Operations
  const addPerson = useCallback((personData) => {
    const newPersonId = `person-${Date.now()}`;
    const newPerson = {
      id: newPersonId,
      name: personData.name || 'New Person',
      role: personData.role || 'Member',
      payFrequency: personData.payFrequency || 'bi-weekly',
      payDay1: personData.payDay1 || 15,
      payDay2: personData.payDay2 || 'last',
      payOffsetDays: personData.payOffsetDays ?? 0,
      accountAllocations: personData.accountAllocations || {},
      grossPerPay: parseFloat(personData.grossPerPay) || 0,
      netPerPay: parseFloat(personData.netPerPay) || 0,
      color: personData.color || 'purple'
    };
    logMatrix('ADD_EARNER', `Added earner: "${newPerson.name}" (${newPerson.payFrequency})`, { person: newPerson });
    setMetadataState(prev => ({
      ...prev,
      people: [...prev.people, newPerson],
      bills: prev.bills.map(b => ({
        ...b,
        splits: { ...b.splits, [newPersonId]: 0 }
      }))
    }));
  }, []);

  const updatePerson = useCallback((id, updatedData) => {
    logMatrix('UPDATE_EARNER', `Updated earner: ${id}`, { id, updatedData });
    setMetadataState(prev => ({
      ...prev,
      people: prev.people.map(p => p.id === id ? { ...p, ...updatedData } : p)
    }));
  }, []);

  const deletePerson = useCallback((id) => {
    logMatrix('DELETE_EARNER', `Deleted earner: ${id}`, { id });
    setMetadataState(prev => ({
      ...prev,
      people: prev.people.filter(p => p.id !== id),
      bills: prev.bills.map(b => {
        const newSplits = { ...b.splits };
        delete newSplits[id];
        return { ...b, splits: newSplits };
      })
    }));
  }, []);

  // Bill Operations
  const addBill = useCallback((billData) => {
    setMetadataState(prev => {
      const count = prev.people.length || 1;
      const initialSplits = {};
      prev.people.forEach(p => {
        initialSplits[p.id] = Math.round(100 / count);
      });

      const defaultDueMonths = billData.dueMonths || (
        billData.dueMonth ? [parseInt(billData.dueMonth)] :
        billData.period === 'Annual' ? [1] :
        billData.period === 'Semi-Annual' ? [1, 7] :
        billData.period === 'Quarterly' ? [1, 4, 7, 10] :
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      );

      const newBill = {
        id: `bill-${Date.now()}`,
        name: billData.name || 'New Bill',
        amount: parseFloat(billData.amount) || 0,
        period: billData.period || 'Monthly',
        accountId: billData.accountId || prev.accounts[0]?.id || '',
        dueDay: parseInt(billData.dueDay) || 1,
        dueMonths: defaultDueMonths,
        paymentSource: billData.paymentSource || 'Auto Pay',
        notes: billData.notes || '',
        matchingKey: billData.matchingKey || billData.matching_key || '',
        splits: billData.splits || initialSplits
      };

      logMatrix('ADD_BILL', `Added bill: "${newBill.name}" ($${newBill.amount}, Due: Day ${newBill.dueDay})`, { bill: newBill });

      return {
        ...prev,
        bills: [...prev.bills, newBill]
      };
    });
  }, []);

  const updateBill = useCallback((id, updatedData) => {
    if (updatedData.accountId) {
      logTransaction('REASSIGN_BILL_ACCOUNT', `Reassigned bill ${id} to account ${updatedData.accountId}`, { billId: id, newAccountId: updatedData.accountId });
    }
    if (updatedData.splits) {
      logTransaction('REASSIGN_BILL_SPLITS', `Updated earner split allocation on bill ${id}`, { billId: id, splits: updatedData.splits });
    }
    logMatrix('UPDATE_BILL', `Updated bill schedule/details: ${id}`, { id, updatedData });
    setMetadataState(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, ...updatedData } : b)
    }));
  }, []);

  const deleteBill = useCallback((id) => {
    logMatrix('DELETE_BILL', `Deleted bill: ${id}`, { id });
    setMetadataState(prev => ({
      ...prev,
      bills: prev.bills.filter(b => b.id !== id)
    }));
  }, []);

  const updateBillSplits = useCallback((billId, splitsMap) => {
    logTransaction('REASSIGN_BILL_SPLITS', `Direct splits update for bill ${billId}`, { billId, splitsMap });
    setMetadataState(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === billId ? { ...b, splits: splitsMap } : b)
    }));
  }, []);

  const archiveBill = useCallback((id) => {
    logMatrix('ARCHIVE_BILL', `Archived bill: ${id}`, { id });
    setMetadataState(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, isArchived: true } : b)
    }));
  }, []);

  const unarchiveBill = useCallback((id) => {
    logMatrix('UNARCHIVE_BILL', `Unarchived bill: ${id}`, { id });
    setMetadataState(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, isArchived: false } : b)
    }));
  }, []);

  // Loan Operations
  const addLoan = useCallback((loanData) => {
    const newLoan = {
      id: `loan-${Date.now()}`,
      name: loanData?.name || 'New Loan',
      description: loanData?.description || 'Loan Amortization',
      principal: parseFloat(loanData?.principal) || 250000,
      annualInterestRate: parseFloat(loanData?.annualInterestRate) || 6.25,
      termMonths: parseInt(loanData?.termMonths) || 360,
      monthlyPayment: parseFloat(loanData?.monthlyPayment) || 0,
      extraPayment: parseFloat(loanData?.extraPayment) || 0,
      accountId: loanData?.accountId || '',
      isArchived: false,
      startDate: loanData?.startDate || '2024-01-01'
    };
    setMetadataState(prev => ({
      ...prev,
      loans: [...(prev.loans || []), newLoan]
    }));
  }, []);

  const updateLoan = useCallback((id, loanData) => {
    setMetadataState(prev => ({
      ...prev,
      loans: (prev.loans || []).map(l => l.id === id ? { ...l, ...loanData } : l)
    }));
  }, []);

  const archiveLoan = useCallback((id) => {
    setMetadataState(prev => ({
      ...prev,
      loans: (prev.loans || []).map(l => l.id === id ? { ...l, isArchived: true } : l)
    }));
  }, []);

  const unarchiveLoan = useCallback((id) => {
    setMetadataState(prev => ({
      ...prev,
      loans: (prev.loans || []).map(l => l.id === id ? { ...l, isArchived: false } : l)
    }));
  }, []);

  const deleteLoan = useCallback((id) => {
    setMetadataState(prev => ({
      ...prev,
      loans: (prev.loans || []).filter(l => l.id !== id)
    }));
  }, []);

  // Dashboard Widgets & Theme
  const getDashboardWidgets = useCallback(() => {
    if (metadataState.dashboardWidgets && Array.isArray(metadataState.dashboardWidgets) && metadataState.dashboardWidgets.length > 0) {
      return metadataState.dashboardWidgets;
    }
    return DEFAULT_DASHBOARD_WIDGETS;
  }, [metadataState.dashboardWidgets]);

  const updateDashboardWidgets = useCallback((newWidgets) => {
    logState('DISPATCH_WIDGETS', 'Updated dashboard widgets configuration', { count: newWidgets?.length });
    setMetadataState(prev => ({
      ...prev,
      dashboardWidgets: newWidgets
    }));
  }, []);

  const toggleDashboardWidgetVisibility = useCallback((id) => {
    setMetadataState(prev => {
      const current = (prev.dashboardWidgets && Array.isArray(prev.dashboardWidgets) && prev.dashboardWidgets.length > 0)
        ? prev.dashboardWidgets
        : DEFAULT_DASHBOARD_WIDGETS;
      const updated = current.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
      return { ...prev, dashboardWidgets: updated };
    });
  }, []);

  const reorderDashboardWidgets = useCallback((fromIndex, toIndex) => {
    setMetadataState(prev => {
      const current = [...((prev.dashboardWidgets && Array.isArray(prev.dashboardWidgets) && prev.dashboardWidgets.length > 0)
        ? prev.dashboardWidgets
        : DEFAULT_DASHBOARD_WIDGETS)];
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return prev;
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      return { ...prev, dashboardWidgets: current };
    });
  }, []);

  const setDashboardWidgetWidth = useCallback((id, width) => {
    setMetadataState(prev => {
      const current = (prev.dashboardWidgets && Array.isArray(prev.dashboardWidgets) && prev.dashboardWidgets.length > 0)
        ? prev.dashboardWidgets
        : DEFAULT_DASHBOARD_WIDGETS;
      const updated = current.map(w => w.id === id ? { ...w, width, customWidth: undefined, customHeight: undefined } : w);
      return { ...prev, dashboardWidgets: updated };
    });
  }, []);

  const setDashboardWidgetCustomSize = useCallback((id, customSize) => {
    setMetadataState(prev => {
      const current = (prev.dashboardWidgets && Array.isArray(prev.dashboardWidgets) && prev.dashboardWidgets.length > 0)
        ? prev.dashboardWidgets
        : DEFAULT_DASHBOARD_WIDGETS;
      const updated = current.map(w => w.id === id ? { ...w, customWidth: customSize?.customWidth, customHeight: customSize?.customHeight } : w);
      return { ...prev, dashboardWidgets: updated };
    });
  }, []);

  const resetDashboardWidgets = useCallback(() => {
    setMetadataState(prev => ({
      ...prev,
      dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS
    }));
  }, []);

  const toggleHideDashboardHeader = useCallback((hideVal) => {
    setMetadataState(prev => ({
      ...prev,
      hideDashboardHeader: hideVal !== undefined ? Boolean(hideVal) : !prev.hideDashboardHeader
    }));
  }, []);

  const theme = metadataState.theme || 'dark';

  const setTheme = useCallback((newTheme) => {
    logState('DISPATCH_THEME', `Changed theme to: ${newTheme}`, { theme: newTheme });
    setMetadataState(prev => ({
      ...prev,
      theme: newTheme
    }));
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }
  }, [theme]);

  // Calculation Utilities
  const getMonthlyNetIncome = useCallback((person) => {
    if (!person) return 0;
    const net = parseFloat(person.netPerPay) || 0;
    if (person.payFrequency === 'semi-monthly') return net * 2;
    if (person.payFrequency === 'bi-weekly') return (net * 26) / 12;
    if (person.payFrequency === 'weekly') return (net * 52) / 12;
    return net;
  }, []);

  const getMonthlyGrossIncome = useCallback((person) => {
    if (!person) return 0;
    const gross = parseFloat(person.grossPerPay) || 0;
    if (person.payFrequency === 'semi-monthly') return gross * 2;
    if (person.payFrequency === 'bi-weekly') return (gross * 26) / 12;
    if (person.payFrequency === 'weekly') return (gross * 52) / 12;
    return gross;
  }, []);

  const getTotalMonthlyNetIncome = useCallback((peopleOverride) => {
    const people = peopleOverride || metadataState.people || [];
    return people.reduce((sum, p) => sum + getMonthlyNetIncome(p), 0);
  }, [metadataState.people, getMonthlyNetIncome]);

  const getTotalMonthlyGrossIncome = useCallback((peopleOverride) => {
    const people = peopleOverride || metadataState.people || [];
    return people.reduce((sum, p) => sum + getMonthlyGrossIncome(p), 0);
  }, [metadataState.people, getMonthlyGrossIncome]);

  const getBillMonthlyCost = useCallback((bill) => {
    if (!bill) return 0;
    const amt = Math.abs(parseFloat(bill.amount) || 0);
    if (bill.period === 'Semi-Annual') return amt / 6;
    if (bill.period === 'Annual') return amt / 12;
    if (bill.period === 'Quarterly') return amt / 3;
    if (bill.period === 'Weekly') return (amt * 52) / 12;
    return amt;
  }, []);

  const getTotalMonthlyExpenses = useCallback((billsOverride) => {
    const bills = billsOverride || metadataState.bills || [];
    return bills.reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  }, [metadataState.bills, getBillMonthlyCost]);

  const getAccountMonthlyExpenses = useCallback((accountId, billsOverride) => {
    const bills = billsOverride || metadataState.bills || [];
    return bills
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  }, [metadataState.bills, getBillMonthlyCost]);

  const getBillPersonMonthlyPortion = useCallback((bill, personId) => {
    if (!bill) return 0;
    const monthlyCost = getBillMonthlyCost(bill);
    const pct = parseFloat(bill.splits?.[personId]) || 0;
    return (monthlyCost * pct) / 100;
  }, [getBillMonthlyCost]);

  const getPersonMonthlyTotal = useCallback((personId, stateOverride) => {
    const state = stateOverride || metadataState;
    const person = (state.people || []).find(p => p.id === personId);
    const billsTotal = (state.bills || []).reduce((sum, b) => sum + getBillPersonMonthlyPortion(b, personId), 0);
    if (!person) return billsTotal;
    const extraSavingsTotal = (state.accounts || []).reduce((sum, acc) => {
      return sum + getAccountSaveExtraPersonPortion(acc, person, state);
    }, 0);
    return billsTotal + extraSavingsTotal;
  }, [metadataState, getBillPersonMonthlyPortion]);

  const getPersonPerPaycheckTotal = useCallback((personId, stateOverride) => {
    const state = stateOverride || metadataState;
    const person = (state.people || []).find(p => p.id === personId);
    if (!person) return 0;
    const monthlyTotal = getPersonMonthlyTotal(personId, state);
    if (person.payFrequency === 'semi-monthly' || person.payFrequency === 'bi-weekly') {
      return monthlyTotal / 2;
    } else if (person.payFrequency === 'weekly') {
      return (monthlyTotal * 12) / 52;
    }
    return monthlyTotal;
  }, [metadataState, getPersonMonthlyTotal]);

  const getUpcomingBills = useCallback((limit = 5, stateOverride) => {
    const state = stateOverride || metadataState;
    const today = new Date();
    const mapped = (state.bills || []).map(bill => {
      const dueDate = getNextBillDueDate(bill, today);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const acc = (state.accounts || []).find(a => a.id === bill.accountId);
      return {
        ...bill,
        monthlyCost: getBillMonthlyCost(bill),
        accountName: acc?.name || 'Unassigned',
        accountColor: acc?.color || 'blue',
        daysUntilDue: Math.max(0, diffDays),
        dueDateFormatted: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });
    return mapped.sort((a, b) => a.daysUntilDue - b.daysUntilDue).slice(0, limit);
  }, [metadataState, getBillMonthlyCost]);

  // Static / starting balance fallback when LedgerDataContext running simulation is unavailable
  const getTotalCashOnHand = useCallback((accountsOverride) => {
    const accounts = accountsOverride || metadataState.accounts || [];
    return accounts.reduce((sum, acc) => {
      let bal = 0;
      if (acc.importedLedgerRows && typeof acc.importedLedgerRows === 'object') {
        const dates = Object.keys(acc.importedLedgerRows).sort();
        if (dates.length > 0) {
          const latest = acc.importedLedgerRows[dates[dates.length - 1]];
          if (typeof latest === 'number') bal = latest;
          else if (latest && typeof latest === 'object' && typeof latest.totalEnding === 'number') bal = latest.totalEnding;
        }
      }
      if (!bal) {
        bal = (parseFloat(acc.startingBalance) || 0) + (acc.enableExtraSavings !== false ? (parseFloat(acc.extraStartingBalance) || 0) : 0);
      }
      return sum + bal;
    }, 0);
  }, [metadataState.accounts]);

  const stateValue = useMemo(() => ({
    budget: metadataState,
    metadataState,
    accounts: metadataState.accounts,
    people: metadataState.people,
    bills: metadataState.bills,
    loans: metadataState.loans,
    theme,
    hideDashboardHeader: Boolean(metadataState.hideDashboardHeader),
    dashboardWidgets: getDashboardWidgets(),
    selectedPersonId,
    isSettingsOpen,
    settingsTab,
    isDbLoaded,
    saveError,
    initialLedgerSeed,
    isAutoCloudBackupEnabled,
    isSyncOnChangeEnabled: isAutoCloudBackupEnabled,
    isSyncOnLoadEnabled,
    lastCloudSyncTime,
    isDebugMode,
    categoryStates,
    debugLogs
  }), [
    metadataState,
    theme,
    getDashboardWidgets,
    selectedPersonId,
    isSettingsOpen,
    settingsTab,
    isDbLoaded,
    saveError,
    initialLedgerSeed,
    isAutoCloudBackupEnabled,
    isSyncOnLoadEnabled,
    lastCloudSyncTime,
    isDebugMode,
    categoryStates,
    debugLogs
  ]);

  const actionsValue = useMemo(() => ({
    setMetadataState,
    setTheme,
    toggleHideDashboardHeader,
    updateDashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    setDashboardWidgetCustomSize,
    reorderDashboardWidgets,
    resetDashboardWidgets,
    setSelectedPersonId,
    setIsSettingsOpen,
    setSettingsTab,
    setSaveError,
    setDebugMode,
    toggleCategory,
    enableAllCategories,
    disableAllCategories,
    resetCategories,
    clearDebugLogs,
    addDebugLog,
    // actions
    addAccount,
    updateAccount,
    deleteAccount,
    addPerson,
    updatePerson,
    deletePerson,
    addBill,
    updateBill,
    deleteBill,
    archiveBill,
    unarchiveBill,
    updateBillSplits,
    addLoan,
    updateLoan,
    archiveLoan,
    unarchiveLoan,
    deleteLoan,
    toggleAutoCloudBackup,
    toggleSyncOnChange: toggleAutoCloudBackup,
    toggleSyncOnLoad,
    setLastCloudSyncTime,
    // calculations
    getMonthlyNetIncome,
    getMonthlyGrossIncome,
    getTotalMonthlyNetIncome,
    getTotalMonthlyGrossIncome,
    getBillMonthlyCost,
    getTotalMonthlyExpenses,
    getAccountMonthlyExpenses,
    getBillPersonMonthlyPortion,
    getPersonMonthlyTotal,
    getPersonPerPaycheckTotal,
    getUpcomingBills,
    getTotalCashOnHand,
    isPersonDepositDay,
    getPersonDepositAmountForAccount
  }), [
    setTheme,
    toggleHideDashboardHeader,
    updateDashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    setDashboardWidgetCustomSize,
    reorderDashboardWidgets,
    resetDashboardWidgets,
    addAccount,
    updateAccount,
    deleteAccount,
    addPerson,
    updatePerson,
    deletePerson,
    addBill,
    updateBill,
    deleteBill,
    archiveBill,
    unarchiveBill,
    updateBillSplits,
    addLoan,
    updateLoan,
    archiveLoan,
    unarchiveLoan,
    deleteLoan,
    toggleAutoCloudBackup,
    setDebugMode,
    toggleCategory,
    enableAllCategories,
    disableAllCategories,
    resetCategories,
    clearDebugLogs,
    addDebugLog,
    getMonthlyNetIncome,
    getMonthlyGrossIncome,
    getTotalMonthlyNetIncome,
    getTotalMonthlyGrossIncome,
    getBillMonthlyCost,
    getTotalMonthlyExpenses,
    getAccountMonthlyExpenses,
    getBillPersonMonthlyPortion,
    getPersonMonthlyTotal,
    getPersonPerPaycheckTotal,
    getUpcomingBills,
    getTotalCashOnHand
  ]);

  const contextValue = useMemo(() => ({
    ...stateValue,
    ...actionsValue
  }), [stateValue, actionsValue]);

  return (
    <BudgetMetadataDispatchContext.Provider value={actionsValue}>
      <BudgetMetadataStateContext.Provider value={stateValue}>
        <BudgetMetadataContext.Provider value={contextValue}>
          {children}
        </BudgetMetadataContext.Provider>
      </BudgetMetadataStateContext.Provider>
    </BudgetMetadataDispatchContext.Provider>
  );
}

export function useBudgetMetadata() {
  const ctx = useContext(BudgetMetadataContext);
  if (!ctx) {
    throw new Error('useBudgetMetadata must be used within a BudgetMetadataProvider');
  }
  return ctx;
}

export function useBudgetMetadataState() {
  const ctx = useContext(BudgetMetadataStateContext);
  if (!ctx) {
    throw new Error('useBudgetMetadataState must be used within a BudgetMetadataProvider');
  }
  return ctx;
}

export function useBudgetMetadataDispatch() {
  const ctx = useContext(BudgetMetadataDispatchContext);
  if (!ctx) {
    throw new Error('useBudgetMetadataDispatch must be used within a BudgetMetadataProvider');
  }
  return ctx;
}

