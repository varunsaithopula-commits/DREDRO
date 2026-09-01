/**
 * BudgetMate Persistent Database Engine (Cloud Firestore & IndexedDB Cache)
 * Guarantees that returning Google users automatically have their data & state restored.
 */

import { 
  db, 
  isFirebaseAvailable, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  deleteDoc 
} from './firebase-config.js';

const INDEXEDDB_NAME = 'BudgetMate_CloudDB';
const INDEXEDDB_VERSION = 1;
let idbPromise = null;

/**
 * Initializes local IndexedDB persistent database instance
 * @returns {Promise<IDBDatabase>}
 */
export function openLocalDB() {
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('users')) {
        const store = idb.createObjectStore('users', { keyPath: 'id' });
        store.createIndex('email', 'email', { unique: true });
      }
      if (!idb.objectStoreNames.contains('transactions')) {
        const store = idb.createObjectStore('transactions', { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
      if (!idb.objectStoreNames.contains('settings')) {
        idb.createObjectStore('settings', { keyPath: 'userId' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

  return idbPromise;
}

// --------------------------------------------------------------------------
// User Profile Database API
// --------------------------------------------------------------------------

/**
 * Gets or creates a Google user profile in the persistent database.
 * Checks if the Google user (by UID or Email) already exists in the database.
 * Returns existing record for returning users, or initializes a new record for first-time users.
 * @param {object} googleUser - { uid, email, displayName, photoURL }
 * @returns {Promise<{ user: object, isReturningUser: boolean }>}
 */
export async function dbGetOrCreateUser(googleUser) {
  const email = (googleUser.email || '').trim().toLowerCase();
  const uid = googleUser.uid || 'g_uid_' + Math.abs(hashCode(email));
  const name = googleUser.displayName || googleUser.name || email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const avatar = googleUser.photoURL || googleUser.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

  let existingUser = null;
  let isReturningUser = false;

  // 1. Check Cloud Firestore Database first if available
  if (isFirebaseAvailable && db) {
    try {
      const userRef = doc(db, 'users', uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        existingUser = docSnap.data();
        isReturningUser = true;
        await updateDoc(userRef, {
          name: name || existingUser.name,
          avatar: avatar || existingUser.avatar,
          lastLoginAt: new Date().toISOString()
        });
        existingUser.name = name || existingUser.name;
        existingUser.avatar = avatar || existingUser.avatar;
      } else {
        existingUser = {
          id: uid,
          googleUid: uid,
          email: email,
          name: name,
          avatar: avatar,
          provider: 'google',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };
        await setDoc(userRef, existingUser);
      }
    } catch (err) {
      console.warn('[BudgetMate DB] Firestore check error, falling back to local DB:', err);
    }
  }

  // 2. Fallback to IndexedDB Database if Firestore not reachable
  if (!existingUser) {
    const idb = await openLocalDB();
    existingUser = await new Promise((resolve) => {
      const tx = idb.transaction('users', 'readonly');
      const store = tx.objectStore('users');
      const index = store.index('email');
      const req = index.get(email);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (existingUser) {
      isReturningUser = true;
      existingUser.lastLoginAt = new Date().toISOString();
      existingUser.name = name || existingUser.name;
      existingUser.avatar = avatar || existingUser.avatar;
    } else {
      existingUser = {
        id: uid,
        googleUid: uid,
        email: email,
        name: name,
        avatar: avatar,
        provider: 'google',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
    }

    // Save to IndexedDB
    const idbWrite = await openLocalDB();
    const tx = idbWrite.transaction('users', 'readwrite');
    tx.objectStore('users').put(existingUser);
  }

  return { user: existingUser, isReturningUser };
}

// --------------------------------------------------------------------------
// Transactions Database API
// --------------------------------------------------------------------------

/**
 * Fetches all transactions for a returning Google user from the persistent database
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
export async function dbFetchUserTransactions(userId) {
  let transactions = [];

  // 1. Fetch from Cloud Firestore Database
  if (isFirebaseAvailable && db) {
    try {
      const q = query(collection(db, 'transactions'), where('userId', '==', userId));
      const querySnap = await getDocs(q);
      querySnap.forEach((docSnap) => {
        transactions.push({ id: docSnap.id, ...docSnap.data() });
      });
    } catch (err) {
      console.warn('[BudgetMate DB] Firestore transactions fetch error:', err);
    }
  }

  // 2. Fetch from IndexedDB local database if Firestore returned empty or offline
  if (transactions.length === 0) {
    const idb = await openLocalDB();
    transactions = await new Promise((resolve) => {
      const tx = idb.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const index = store.index('userId');
      const req = index.getAll(userId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  // Sort newest first
  transactions.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  return transactions;
}

/**
 * Saves or updates a transaction in the persistent database
 * @param {string} userId 
 * @param {object} transaction 
 * @returns {Promise<object>}
 */
export async function dbSaveTransaction(userId, transaction) {
  if (!transaction || !transaction.id) return transaction;
  const record = { ...transaction, userId: userId || 'guest', updatedAt: new Date().toISOString() };

  // 1. Commit to Firestore
  if (isFirebaseAvailable && db) {
    try {
      const txRef = doc(db, 'transactions', record.id);
      await setDoc(txRef, record, { merge: true });
    } catch (err) {
      console.warn('[BudgetMate DB] Firestore transaction write warning:', err);
    }
  }

  // 2. Commit to IndexedDB
  try {
    const idb = await openLocalDB();
    const tx = idb.transaction('transactions', 'readwrite');
    tx.objectStore('transactions').put(record);
  } catch (err) {
    console.error('[BudgetMate DB] Local DB write error:', err);
  }

  return record;
}

/**
 * Deletes a transaction from the persistent database
 * @param {string} userId 
 * @param {string} transactionId 
 * @returns {Promise<boolean>}
 */
export async function dbDeleteTransaction(userId, transactionId) {
  if (!transactionId) return true;

  // 1. Delete from Firestore
  if (isFirebaseAvailable && db) {
    try {
      await deleteDoc(doc(db, 'transactions', transactionId));
    } catch (err) {
      console.warn('[BudgetMate DB] Firestore transaction delete warning:', err);
    }
  }

  // 2. Delete from IndexedDB
  try {
    const idb = await openLocalDB();
    const tx = idb.transaction('transactions', 'readwrite');
    tx.objectStore('transactions').delete(transactionId);
  } catch (err) {
    console.error('[BudgetMate DB] Local DB delete error:', err);
  }

  return true;
}

/**
 * Replaces all transactions for a user (used for import/reset)
 * @param {string} userId 
 * @param {Array} transactions 
 */
export async function dbReplaceUserTransactions(userId, transactions) {
  if (!Array.isArray(transactions)) return;
  for (const t of transactions) {
    dbSaveTransaction(userId, t).catch(() => {});
  }
}

// --------------------------------------------------------------------------
// Settings Database API
// --------------------------------------------------------------------------

/**
 * Fetches user budget settings from the database
 * @param {string} userId 
 * @returns {Promise<object|null>}
 */
export async function dbFetchUserSettings(userId) {
  if (isFirebaseAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'settings', userId));
      if (snap.exists()) return snap.data();
    } catch (e) {}
  }

  const idb = await openLocalDB();
  return new Promise((resolve) => {
    const tx = idb.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get(userId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Saves user budget settings to the database
 * @param {string} userId 
 * @param {object} settings 
 */
export async function dbSaveUserSettings(userId, settings) {
  const record = { userId, ...settings, updatedAt: new Date().toISOString() };

  if (isFirebaseAvailable && db) {
    try {
      await setDoc(doc(db, 'settings', userId), record);
    } catch (e) {}
  }

  const idb = await openLocalDB();
  const tx = idb.transaction('settings', 'readwrite');
  tx.objectStore('settings').put(record);
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
