/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// =========================================================================
// FIREBASE CONFIGURATION (OPSI B)
// =========================================================================
// Silakan isi langsung kredensial web app Anda dari Firebase Console di sini
// jika ingin meletakkan kredensial statis, ATAU gunakan file `.env`
// dengan mengisikan variabel lingkungan seperti VITE_FIREBASE_API_KEY dll.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB5gCjU8cHlFA374vgwXpP-8TdDqQI-An0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "budgetinyuk-23414.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "budgetinyuk-23414",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "budgetinyuk-23414.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "174540990576",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:174540990576:web:6e3c03db6072ccdfa55cfb", // Sesuaikan dengan App ID web Anda
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// isMock diatur ke false untuk production sesungguhnya
export const isMock = false;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const signIn = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);
