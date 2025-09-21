import {
  getApps,
  initializeApp,
  type FirebaseApp
} from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  serverTimestamp
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions
} from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Validate Firebase configuration
function validateFirebaseConfig(config: typeof firebaseConfig) {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missing = requiredFields.filter(field => !config[field as keyof typeof config]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required Firebase configuration: ${missing.join(', ')}`);
  }
  
  // Basic validation for apiKey format
  if (config.apiKey && !config.apiKey.match(/^[A-Za-z0-9_-]+$/)) {
    throw new Error('Invalid Firebase API key format');
  }
  
  // Validate domain format
  if (config.authDomain && !config.authDomain.match(/^[a-zA-Z0-9.-]+\.firebaseapp\.com$/)) {
    throw new Error('Invalid Firebase auth domain format');
  }
  
  return config;
}

function createFirebaseApp(): FirebaseApp {
  if (!getApps().length) {
    const validatedConfig = validateFirebaseConfig(firebaseConfig);
    return initializeApp(validatedConfig);
  }

  return getApps()[0];
}

export const app = createFirebaseApp();
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION ?? 'us-central1');

const shouldUseEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

if (shouldUseEmulator && typeof window !== 'undefined') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

let authReadyPromise: Promise<User | null> | null = null;

export const ensureSignedIn = (): Promise<User | null> => {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise<User | null>((resolve, reject) => {
      const unsub = onAuthStateChanged(
        auth,
        async (user) => {
          if (user) {
            unsub();
            resolve(user);
          } else {
            try {
              const credential = await signInAnonymously(auth);
              resolve(credential.user);
            } catch (error) {
              reject(error);
            }
          }
        },
        (error) => {
          reject(error);
        }
      );
    }).finally(() => {
      authReadyPromise = null;
    });
  }

  return authReadyPromise;
};

export const getServerTimestamp = serverTimestamp;
