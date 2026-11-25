import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  OperationType,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  testConnection,
} from '../lib/firebase';
import { setAuthTokenProvider } from '../api';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUserProfileDoc(firebaseUser: User): Promise<void> {
  const profilePath = `users/${firebaseUser.uid}`;
  const ref = doc(db, 'users', firebaseUser.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, profilePath);
  }

  const safeEmail = (firebaseUser.email || `${firebaseUser.uid}@lifebonds.local`).slice(0, 200);
  const safeName = (firebaseUser.displayName || safeEmail.split('@')[0] || 'Clinical Staff').slice(0, 100);

  if (!existingSnap.exists()) {
    try {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        email: safeEmail,
        displayName: safeName,
        departmentUnit: 'Emergency Triage Unit',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, profilePath);
    }
  } else {
    try {
      await updateDoc(ref, {
        email: safeEmail,
        displayName: safeName,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, profilePath);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const current = auth.currentUser;
    if (!current) return null;
    return current.getIdToken();
  }, []);

  useEffect(() => {
    setAuthTokenProvider(getToken);
    return () => setAuthTokenProvider(null);
  }, [getToken]);

  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && nextUser.emailVerified) {
        try {
          await testConnection();
          await ensureUserProfileDoc(nextUser);
        } catch (err) {
          console.warn('Staff profile sync notice:', err);
        }
      }
      if (!active) return;
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        signingIn,
        authError,
        signInWithGoogle,
        signOutUser,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
