import React, { createContext, useContext, useState, useEffect } from 'react';
import { initialBudgetData } from '../initialData';

const BudgetContext = createContext();

const STORAGE_KEY = 'personal_budget_app_data_v1';

export function BudgetProvider({ children }) {
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

  // Persist to localStorage whenever budget state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
    } catch (e) {
      console.error('Failed to save budget to localStorage:', e);
    }
  }, [budget]);

  // Account Operations
  const addAccount = (accountData) => {
    const newAcc = {
      id: `acc-${Date.now()}`,
      name: accountData.name || 'New Account',
      type: accountData.type || 'checking',
      startingBalance: parseFloat(accountData.startingBalance) || 0,
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

  // Loan Operations
  const updateLoan = (loanData) => {
    setBudget(prev => ({
      ...prev,
      loan: { ...prev.loan, ...loanData }
    }));
  };

  // Reset to default spreadsheet data
  const resetToDefaults = () => {
    setBudget(initialBudgetData);
  };

  // Import JSON Config
  const importBudgetJson = (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.accounts && parsed.people && parsed.bills) {
        setBudget(parsed);
        return { success: true };
      }
      return { success: false, error: 'Invalid budget JSON schema.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
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

  return (
    <BudgetContext.Provider
      value={{
        budget,
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
        updateBillSplits,
        updateLoan,
        resetToDefaults,
        importBudgetJson,
        // line-item operations
        upsertLineItem,
        getLineItem,
        getActualAmount,
        getEffectiveAmount,
        getTotalActualExpenses,
        getAccountActualExpenses,
        getAccountProjectedEndBalance,
        getAccountActualEndBalance,
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
        getTotalCashOnHand
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
