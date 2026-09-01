/**
 * BudgetMate Firebase Configuration & SDK Loader
 * Manages Firebase App, Firebase Auth (Google Provider), and Cloud Firestore Database
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Real User Firebase Credentials (budgetmate-13702)
export const firebaseConfig = {
  apiKey: "AIzaSyAppRCNp-_pVlPu74a2K3mvgUKPdFH0al8",
  authDomain: "budgetmate-13702.firebaseapp.com",
  projectId: "budgetmate-13702",
  storageBucket: "budgetmate-13702.firebasestorage.app",
  messagingSenderId: "153563237930",
  appId: "1:153563237930:web:27633851b107d7b5313d53",
  measurementId: "G-BFHGPVKMCH"
};

let app = null;
let auth = null;
let db = null;
let googleProvider = null;
let isFirebaseAvailable = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  isFirebaseAvailable = true;
  console.log('[BudgetMate Firebase] Connected to project budgetmate-13702 successfully!');
} catch (err) {
  console.warn('[BudgetMate Firebase] Initialization error:', err);
}

export { 
  app, 
  auth, 
  db, 
  googleProvider, 
  isFirebaseAvailable,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  deleteDoc 
};
