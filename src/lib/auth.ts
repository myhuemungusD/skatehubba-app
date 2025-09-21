import { auth } from "@/lib/firebase/client";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  type User,
} from "firebase/auth";

export function ensureAnonSignIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsub();
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          unsub();
          resolve(cred.user);
        } catch (error) {
          unsub();
          reject(error);
        }
      }
    });
  });
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}
