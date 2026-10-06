import { initializeApp } from "firebase/app";
import {
  getAuth,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const app = initializeApp(config);
export const auth = getAuth(app);
// A separate guest identity lets owners preview their own restaurant without signing out.
export const guestAuth = getAuth(initializeApp(config, "visitor"));
export const guestReady = setPersistence(guestAuth, browserSessionPersistence);
export const db = getFirestore(app);
export const guestDb = getFirestore(guestAuth.app);
