// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { initialBudgetData, DEFAULT_DASHBOARD_WIDGETS } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useAuth } from './AuthContext';
import { isPersonDepositDay, getPersonDepositAmountForAccount } from '../utils/paydayUtils';

const BudgetContext = createContext();

const STORAGE_KEY = 'personal_budget_app_data_v1';

export function BudgetProvider({ children }) {
  const { token, user } = useAuth();
  const [selectedPersonId, setSelectedPersonId] = useState('all');

  const [budget, setBudget] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load budget from localStorage:', e);
    }
    return initialBudgetData;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('accounts'); // 'accounts' | 'people' | 'bills' | 'splits' | 'data'
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' | 'main_budget' | 'ledger' | 'amortization'
  const isInitialCloudFetch = useRef(true);

  // Fetch Cloud Budget when user logs in
  useEffect(() => {
    async function fetchCloudBudget() {
      if (!token) return;
      try {
        const res = await fetch('/api/budget', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.budget) {
            setBudget(data.budget);
            isInitialCloudFetch.current = true;
          }
        }
      } catch (err) {
        console.error('Failed to fetch budget from Cloudflare D1:', err);
      }
    }
    fetchCloudBudget();
  }, [token]);

  // Persist to localStorage whenever budget state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
    } catch (e) {
      console.error('Failed to save budget to localStorage:', e);
    }
  }, [budget]);

  // Sync to Cloudflare D1 database when budget updates (debounced)
  useEffect(() => {
    if (!token) return;
    
    // Skip initial trigger right after loading cloud data
    if (isInitialCloudFetch.current) {
      isInitialCloudFetch.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        await fetch('/api/budget', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ budget })
        });
      } catch (err) {
        console.error('Failed to sync budget to Cloudflare D1:', err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [budget, token]);

  // Account Operations
  const addAccount = (accountData) => {
    const newAcc = {
      id: `acc-${Date.now()}`,
      name: accountData.name || 'New Account',
      type: accountData.type || 'checking',
      startingBalance: parseFloat(accountData.startingBalance) || 0,
      balanceAsOfDate: accountData.balanceAsOfDate || new Date().toISOString().split('T')[0],
      extraStartingBalance: parseFloat(accountData.extraStartingBalance) || 0,
      saveExtraMonthly: parseFloat(accountData.saveExtraMonthly) || 0,
      enableExtraSavings: accountData.enableExtraSavings ?? true,
      color: accountData.color || 'blue',
      notes: accountData.notes || ''
    };
    setBudget(prev => ({
      ...prev,
      accounts: [...prev.accounts, newAcc]
    }));
  };

  const updateAccount = (id, updatedData) => {
    setBudget(prev => ({
      ...prev,
      accounts: prev.accounts.map(acc => acc.id === id ? { ...acc, ...updatedData } : acc)
    }));
  };

  const deleteAccount = (id) => {
    setBudget(prev => ({
      ...prev,
      accounts: prev.accounts.filter(acc => acc.id !== id),
      // reassign or filter bills assigned to this account
      bills: prev.bills.map(b => b.accountId === id ? { ...b, accountId: prev.accounts.find(a => a.id !== id)?.id || '' } : b)
    }));
  };

  // Person Operations
  const addPerson = (personData) => {
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
    setBudget(prev => ({
      ...prev,
      people: [...prev.people, newPerson],
      bills: prev.bills.map(b => ({
        ...b,
        splits: { ...b.splits, [newPersonId]: 0 }
      }))
    }));
  };

  const updatePerson = (id, updatedData) => {
    setBudget(prev => ({
      ...prev,
      people: prev.people.map(p => p.id === id ? { ...p, ...updatedData } : p)
    }));
  };

  const deletePerson = (id) => {
    setBudget(prev => ({
      ...prev,
      people: prev.people.filter(p => p.id !== id),
      bills: prev.bills.map(b => {
        const newSplits = { ...b.splits };
        delete newSplits[id];
        return { ...b, splits: newSplits };
      })
    }));
  };

  // Bill Operations
  const addBill = (billData) => {
    const initialSplits = {};
    const count = budget.people.length || 1;
    budget.people.forEach(p => {
      initialSplits[p.id] = Math.round(100 / count);
    });

    const newBill = {
      id: `bill-${Date.now()}`,
      name: billData.name || 'New Bill',
      amount: parseFloat(billData.amount) || 0,
      period: billData.period || 'Monthly',
      accountId: billData.accountId || budget.accounts[0]?.id || '',
      dueDay: parseInt(billData.dueDay) || 1,
      paymentSource: billData.paymentSource || 'Auto Pay',
      notes: billData.notes || '',
      splits: billData.splits || initialSplits
    };

    setBudget(prev => ({
      ...prev,
      bills: [...prev.bills, newBill]
    }));
  };

  const updateBill = (id, updatedData) => {
    setBudget(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, ...updatedData } : b)
    }));
  };

  const deleteBill = (id) => {
    setBudget(prev => ({
      ...prev,
      bills: prev.bills.filter(b => b.id !== id)
    }));
  };

  const updateBillSplits = (billId, splitsMap) => {
    setBudget(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === billId ? { ...b, splits: splitsMap } : b)
    }));
  };

  const archiveBill = (id) => {
    setBudget(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, isArchived: true } : b)
    }));
  };

  const unarchiveBill = (id) => {
    setBudget(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, isArchived: false } : b)
    }));
  };

  // Loan Operations
  const addLoan = (loanData) => {
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
    setBudget(prev => {
      const existingLoans = prev.loans || [];
      return {
        ...prev,
        loans: [...existingLoans, newLoan]
      };
    });
  };

  const updateLoan = (id, loanData) => {
    setBudget(prev => {
      const existingLoans = prev.loans || [];
      return {
        ...prev,
        loans: existingLoans.map(l => l.id === id ? { ...l, ...loanData } : l)
      };
    });
  };

  const archiveLoan = (id) => {
    setBudget(prev => {
      const existingLoans = prev.loans || [];
      return {
        ...prev,
        loans: existingLoans.map(l => l.id === id ? { ...l, isArchived: true } : l)
      };
    });
  };

  const unarchiveLoan = (id) => {
    setBudget(prev => {
      const existingLoans = prev.loans || [];
      return {
        ...prev,
        loans: existingLoans.map(l => l.id === id ? { ...l, isArchived: false } : l)
      };
    });
  };

  const deleteLoan = (id) => {
    setBudget(prev => {
      const existingLoans = prev.loans || [];
      return {
        ...prev,
        loans: existingLoans.filter(l => l.id !== id)
      };
    });
  };

  // Load 100% Fake Demo Preset Data
  const loadDemoPreset = () => {
    setBudget(fakeDemoBudgetData);
  };

  // Reset to default spreadsheet data
  const resetToDefaults = () => {
    setBudget(initialBudgetData);
  };

  // Clear all data (100% clean slate)
  const clearAllData = () => {
    setBudget({
      accounts: [],
      people: [],
      bills: [],
      lineItems: [],
      loans: [],
      dailyMatrix: {}
    });
  };

  // Import Parsed Spreadsheet Data (replace or merge)
  const importParsedSpreadsheet = (parsedData, mode = 'replace') => {
    if (!parsedData || !parsedData.accounts) return { success: false, error: 'Invalid parsed data.' };

    setBudget(prev => {
      if (mode === 'replace') {
        return {
          lineItems: [],
          accounts: parsedData.accounts || [],
          people: parsedData.people || [],
          bills: parsedData.bills || [],
          loans: parsedData.loans || []
        };
      }

      // Merge Mode
      const existingAccNames = new Set(prev.accounts.map(a => a.name.toLowerCase()));
      const newAccs = (parsedData.accounts || []).filter(a => !existingAccNames.has(a.name.toLowerCase()));

      const existingBillNames = new Set(prev.bills.map(b => b.name.toLowerCase()));
      const newBills = (parsedData.bills || []).filter(b => !existingBillNames.has(b.name.toLowerCase()));

      const existingPeopleNames = new Set(prev.people.map(p => p.name.toLowerCase()));
      const newPeople = (parsedData.people || []).filter(p => !existingPeopleNames.has(p.name.toLowerCase()));

      const existingLoanNames = new Set((prev.loans || []).map(l => l.name.toLowerCase()));
      const newLoans = (parsedData.loans || []).filter(l => !existingLoanNames.has(l.name.toLowerCase()));

      return {
        ...prev,
        accounts: [...prev.accounts, ...newAccs],
        people: [...prev.people, ...newPeople],
        bills: [...prev.bills, ...newBills],
        loans: [...(prev.loans || []), ...newLoans]
      };
    });

    return { success: true };
  };

  // --- Line Item Operations (Actual vs. Projected) ---
  const getLineItem = (billId, monthKey) => {
    return budget.lineItems?.find(li => li.billId === billId && li.monthKey === monthKey);
  };

  const upsertLineItem = (billId, monthKey, actualAmount) => {
    setBudget(prev => {
      const existing = prev.lineItems?.findIndex(li => li.billId === billId && li.monthKey === monthKey);
      const updated = [...(prev.lineItems || [])];
      const entry = { billId, monthKey, actualAmount: parseFloat(actualAmount) || 0, updatedAt: Date.now() };
      if (existing >= 0) {
        updated[existing] = { ...updated[existing], ...entry };
      } else {
        updated.push(entry);
      }
      return { ...prev, lineItems: updated };
    });
  };

  const getActualAmount = (billId, monthKey) => {
    const li = getLineItem(billId, monthKey);
    return li ? li.actualAmount : null; // null means use projected
  };

  const getEffectiveAmount = (bill, monthKey) => {
    const li = getLineItem(bill.id, monthKey);
    return li ? li.actualAmount : getBillMonthlyCost(bill);
  };

  const getTotalActualExpenses = (monthKey) => {
    return budget.bills.reduce((sum, b) => {
      const li = getLineItem(b.id, monthKey);
      return sum + (li ? li.actualAmount : getBillMonthlyCost(b));
    }, 0);
  };

  const getAccountActualExpenses = (accountId, monthKey) => {
    return budget.bills
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getEffectiveAmount(b, monthKey), 0);
  };

  const getAccountProjectedEndBalance = (accountId, monthKey) => {
    const acc = budget.accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    const projectedExpenses = budget.bills
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
    return (acc.startingBalance || 0) - projectedExpenses;
  };

  const getAccountActualEndBalance = (accountId, monthKey) => {
    const acc = budget.accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    const actualExpenses = getAccountActualExpenses(accountId, monthKey);
    return (acc.startingBalance || 0) - actualExpenses;
  };

  // Calculation Utilities
  const getMonthlyNetIncome = (person) => {
    const net = parseFloat(person.netPerPay) || 0;
    if (person.payFrequency === 'bi-weekly') {
      return (net * 26) / 12; // Standard bi-weekly annual to monthly
    } else if (person.payFrequency === 'weekly') {
      return (net * 52) / 12;
    }
    return net; // monthly
  };

  const getMonthlyGrossIncome = (person) => {
    const gross = parseFloat(person.grossPerPay) || 0;
    if (person.payFrequency === 'bi-weekly') {
      return (gross * 26) / 12;
    } else if (person.payFrequency === 'weekly') {
      return (gross * 52) / 12;
    }
    return gross;
  };

  const getTotalMonthlyNetIncome = () => {
    return budget.people.reduce((sum, p) => sum + getMonthlyNetIncome(p), 0);
  };

  const getTotalMonthlyGrossIncome = () => {
    return budget.people.reduce((sum, p) => sum + getMonthlyGrossIncome(p), 0);
  };

  const getBillMonthlyCost = (bill) => {
    const amt = parseFloat(bill.amount) || 0;
    if (bill.period === 'Semi-Annual') return amt / 6;
    if (bill.period === 'Annual') return amt / 12;
    if (bill.period === 'Weekly') return (amt * 52) / 12;
    return amt; // Monthly
  };

  const getTotalMonthlyExpenses = () => {
    return budget.bills.reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  };

  const getAccountMonthlyExpenses = (accountId) => {
    return budget.bills
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  };

  const getBillPersonMonthlyPortion = (bill, personId) => {
    const monthlyCost = getBillMonthlyCost(bill);
    const pct = parseFloat(bill.splits?.[personId]) || 0;
    return (monthlyCost * pct) / 100;
  };

  const getPersonMonthlyTotal = (personId) => {
    return budget.bills.reduce((sum, b) => sum + getBillPersonMonthlyPortion(b, personId), 0);
  };

  const getPersonPerPaycheckTotal = (personId) => {
    const person = budget.people.find(p => p.id === personId);
    if (!person) return 0;
    const monthlyTotal = getPersonMonthlyTotal(personId);
    if (person.payFrequency === 'bi-weekly') {
      return monthlyTotal / 2;
    } else if (person.payFrequency === 'weekly') {
      return (monthlyTotal * 12) / 52;
    }
    return monthlyTotal;
  };

  const getUpcomingBills = (limit = 5) => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const mapped = budget.bills.map(bill => {
      const dueDay = parseInt(bill.dueDay) || 1;
      let dueDate;
      if (dueDay >= currentDay) {
        dueDate = new Date(currentYear, currentMonth, dueDay);
      } else {
        dueDate = new Date(currentYear, currentMonth + 1, dueDay);
      }

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const acc = budget.accounts.find(a => a.id === bill.accountId);

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
  };

  const getTotalCashOnHand = () => {
    return budget.accounts.reduce((sum, acc) => sum + (parseFloat(acc.startingBalance) || 0), 0);
  };

  // --- Daily Matrix Operations (Per-day spreadsheet cell overrides) ---
  const getDailyMatrixCell = (accountId, monthKey, day, field) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    return budget.dailyMatrix?.[key];
  };

  const updateDailyMatrixCell = (accountId, monthKey, day, field, value) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    setBudget(prev => ({
      ...prev,
      dailyMatrix: {
        ...(prev.dailyMatrix || {}),
        [key]: value
      }
    }));
  };

  const getDashboardWidgets = () => {
    if (budget.dashboardWidgets && Array.isArray(budget.dashboardWidgets) && budget.dashboardWidgets.length > 0) {
      return budget.dashboardWidgets;
    }
    return DEFAULT_DASHBOARD_WIDGETS;
  };

  const updateDashboardWidgets = (newWidgets) => {
    setBudget(prev => ({
      ...prev,
      dashboardWidgets: newWidgets
    }));
  };

  const toggleDashboardWidgetVisibility = (id) => {
    const current = getDashboardWidgets();
    const updated = current.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
    updateDashboardWidgets(updated);
  };

  const reorderDashboardWidgets = (fromIndex, toIndex) => {
    const current = [...getDashboardWidgets()];
    if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    updateDashboardWidgets(current);
  };

  const setDashboardWidgetWidth = (id, width) => {
    const current = getDashboardWidgets();
    const updated = current.map(w => w.id === id ? { ...w, width, customWidth: undefined, customHeight: undefined } : w);
    updateDashboardWidgets(updated);
  };

  const setDashboardWidgetCustomSize = (id, customSize) => {
    const current = getDashboardWidgets();
    const updated = current.map(w => w.id === id ? { ...w, customWidth: customSize?.customWidth, customHeight: customSize?.customHeight } : w);
    updateDashboardWidgets(updated);
  };

  const theme = budget.theme || 'dark';

  const setTheme = (newTheme) => {
    setBudget(prev => ({
      ...prev,
      theme: newTheme
    }));
  };

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

  return (
    <BudgetContext.Provider
      value={{
        budget,
        theme,
        setTheme,
        dashboardWidgets: getDashboardWidgets(),
        updateDashboardWidgets,
        toggleDashboardWidgetVisibility,
        setDashboardWidgetWidth,
        setDashboardWidgetCustomSize,
        reorderDashboardWidgets,
        resetDashboardWidgets,
        selectedPersonId,
        setSelectedPersonId,
        activeView,
        setActiveView,
        isSettingsOpen,
        setIsSettingsOpen,
        settingsTab,
        setSettingsTab,
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
        resetToDefaults,
        clearAllData,
        loadDemoPreset,
        importParsedSpreadsheet,
        // line-item operations
        upsertLineItem,
        getLineItem,
        getActualAmount,
        getEffectiveAmount,
        getTotalActualExpenses,
        getAccountActualExpenses,
        getAccountProjectedEndBalance,
        getAccountActualEndBalance,
        getDailyMatrixCell,
        updateDailyMatrixCell,
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
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return ctx;
}
