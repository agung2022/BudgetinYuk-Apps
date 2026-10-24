/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "SECRET",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "SECRET",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "budgetinyuk-23414",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "SECRET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "SECRET",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "SECRET", 
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
