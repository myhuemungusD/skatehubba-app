import { auth } from "./firebase";
import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, User } from "firebase/auth";

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
        } catch (e) {
          unsub();
          reject(e);
        }
      }
    });
  });
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}
