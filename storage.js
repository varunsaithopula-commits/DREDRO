/**
 * BudgetMate Storage Manager (Cloud Firestore & IndexedDB Persistence)
 * Handles data loading, saving, and schema migrations per Google user ID.
 */

import { generateId, getTodayISO } from './utils.js';
import {
  dbFetchUserTransactions,
  dbReplaceUserTransactions,
  dbFetchUserSettings,
  dbSaveUserSettings,
  dbDeleteTransaction
} from './db.js';

const BASE_STORAGE_KEY = 'expenseTracker:data';
export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  currencySymbol: '₹',
  currencyCode: 'INR',
  monthlyBudget: 35000,
  startOfWeek: 'Mon'
};

function getStorageKey(userId) {
  if (userId) {
    return `${BASE_STORAGE_KEY}:${userId}`;
  }
  try {
    const rawUser = localStorage.getItem('expenseTracker:currentUser');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && u.id) return `${BASE_STORAGE_KEY}:${u.id}`;
    }
  } catch (e) {}
  return BASE_STORAGE_KEY;
}

export function getInitialData() {
  const today = new Date();
  const year = today.getFullYear();
  const monthStr = String(today.getMonth() + 1).padStart(2, '0');
  const d = (day) => `${year}-${monthStr}-${String(day).padStart(2, '0')}`;

  const sampleTransactions = [
    {
      id: generateId(),
      type: 'income',
      amount: 75000,
      category: 'Salary',
      date: d(1),
      note: 'Monthly salary credit',
      paymentMethod: 'Bank Transfer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 14500,
      category: 'Bills & Utilities',
      date: d(2),
      note: 'Apartment Rent',
      paymentMethod: 'Bank Transfer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 3200,
      category: 'Food & Dining',
      date: d(4),
      note: 'Weekly Grocery Shopping',
      paymentMethod: 'Credit Card',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 1800,
      category: 'Transportation',
      date: d(6),
      note: 'Fuel refill',
      paymentMethod: 'UPI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 2400,
      category: 'Entertainment',
      date: d(8),
      note: 'Movie night & dinner',
      paymentMethod: 'UPI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 4500,
      category: 'Shopping',
      date: d(10),
      note: 'New headphones',
      paymentMethod: 'Credit Card',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'expense',
      amount: 1250,
      category: 'Health & Wellness',
      date: d(11),
      note: 'Pharmacy & vitamins',
      paymentMethod: 'Cash',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: generateId(),
      type: 'income',
      amount: 8500,
      category: 'Freelance',
      date: d(12),
      note: 'Web design gig payout',
      paymentMethod: 'UPI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  return {
    version: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    transactions: sampleTransactions
  };
}

export function migrateStore(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return getInitialData();
  }

  let data = { ...rawData };
  data.version = CURRENT_SCHEMA_VERSION;
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  data.transactions = Array.isArray(data.transactions) ? data.transactions : [];

  return data;
}

/**
 * Asynchronously loads store from persistent database for the Google user
 * @param {string} userId 
 * @returns {Promise<object>}
 */
export async function getStoreAsync(userId) {
  try {
    const dbTransactions = await dbFetchUserTransactions(userId);
    const dbSettingsRecord = await dbFetchUserSettings(userId);

    let settings = dbSettingsRecord ? { ...DEFAULT_SETTINGS, ...dbSettingsRecord } : null;
    let transactions = dbTransactions;

    if (!transactions || transactions.length === 0) {
      const localStore = getStore(userId);
      if (localStore && localStore.transactions && localStore.transactions.length > 0) {
        transactions = localStore.transactions;
        settings = localStore.settings;
      } else {
        const initial = getInitialData();
        transactions = initial.transactions;
        settings = initial.settings;
      }
      await dbReplaceUserTransactions(userId, transactions);
      await dbSaveUserSettings(userId, settings);
    }

    if (!settings) {
      settings = { ...DEFAULT_SETTINGS };
    }

    const storeObj = {
      version: CURRENT_SCHEMA_VERSION,
      settings: settings,
      transactions: transactions
    };

    saveStore(storeObj, userId);
    return storeObj;
  } catch (err) {
    console.error('[BudgetMate DB] Error fetching from database, using local cache:', err);
    return getStore(userId);
  }
}

/**
 * Asynchronously persists store to database and local cache
 * @param {object} store 
 * @param {string} userId 
 */
export async function saveStoreAsync(store, userId) {
  saveStore(store, userId);
  try {
    if (userId) {
      await dbReplaceUserTransactions(userId, store.transactions || []);
      await dbSaveUserSettings(userId, store.settings || DEFAULT_SETTINGS);
    }
  } catch (err) {
    console.error('[BudgetMate DB] Error saving to database:', err);
  }
}

export function getStore(userId) {
  const key = getStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initial = getInitialData();
      saveStore(initial, userId);
      return initial;
    }
    const parsed = JSON.parse(raw);
    const migrated = migrateStore(parsed);
    saveStore(migrated, userId);
    return migrated;
  } catch (err) {
    console.error('[KuroSpend Storage] Corrupt data detected:', err);
    return getInitialData();
  }
}

export function saveStore(store, userId) {
  const key = getStorageKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch (err) {
    console.error('[KuroSpend Storage] Failed to save store:', err);
  }
}

export async function resetStoreAsync(userId) {
  const key = getStorageKey(userId);
  try {
    localStorage.removeItem(key);
    const initial = getInitialData();
    if (userId) {
      await dbReplaceUserTransactions(userId, initial.transactions);
      await dbSaveUserSettings(userId, initial.settings);
    }
    saveStore(initial, userId);
    return initial;
  } catch (err) {
    console.error('[KuroSpend Storage] Failed to reset store:', err);
    return getInitialData();
  }
}

export function resetStore(userId) {
  const key = getStorageKey(userId);
  try {
    localStorage.removeItem(key);
    const initial = getInitialData();
    saveStore(initial, userId);
    return initial;
  } catch (err) {
    console.error('[KuroSpend Storage] Failed to reset store:', err);
    return getInitialData();
  }
}
