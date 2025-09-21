// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Your config
const firebaseConfig = {
  apiKey: "AIzaSyD6kLt4GKV4adX-oQ3m_aXIpL6GXBP0xZw",
  authDomain: "sk8hub-d7806.firebaseapp.com",
  projectId: "sk8hub-d7806",
  storageBucket: "sk8hub-d7806.firebasestorage.app",
  messagingSenderId: "665573979824",
  appId: "1:665573979824:web:731aaae46daea5efee2d75",
  measurementId: "G-7XVNF1LHZW"
};

// Initialize
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "true") {
  connectFunctionsEmulator(functions, "localhost", 5001);
}

// Analytics must be conditional
let analytics: ReturnType<typeof getAnalytics> | undefined;
if (typeof window !== "undefined") {
  isSupported().then((yes) => {
    if (yes) {
      analytics = getAnalytics(app);
    }
  });
}
export { analytics };
