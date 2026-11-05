import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

export const firebaseAuth = isFirebaseConfigured
  ? getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const FIREBASE_SESSION_TOKEN = 'firebase-session';

export async function loginWithFirebase(email: string, password: string): Promise<void> {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication no está configurado para esta aplicación.');
  }

  const { user } = await signInWithEmailAndPassword(firebaseAuth, email, password);
  if (!user.emailVerified) {
    await sendEmailVerification(user);
    await signOut(firebaseAuth);
    throw new Error('Verifica tu correo electrónico. Te enviamos un nuevo enlace de verificación.');
  }
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication no está configurado para esta aplicación.');
  }
  await sendPasswordResetEmail(firebaseAuth, email);
}

export async function changeFirebasePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = firebaseAuth?.currentUser;
  if (!user?.email) {
    throw new Error('No hay una cuenta Firebase activa para cambiar la contraseña.');
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function signOutFirebase(): Promise<void> {
  if (firebaseAuth?.currentUser) {
    await signOut(firebaseAuth);
  }
}
