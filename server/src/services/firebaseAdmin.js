import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.FIREBASE_PROJECT_ID || 'logixt-59b8c';
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

let firebaseAuth;

export function getFirebaseAdminAuth() {
  if (!serviceAccountJson) return null;
  if (firebaseAuth) return firebaseAuth;

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON válido.');
  }

  if (serviceAccount.project_id !== projectId) {
    throw new Error('La cuenta de servicio de Firebase pertenece a otro proyecto.');
  }

  const app = getApps().find((registeredApp) => registeredApp.name === 'logixt-auth') ||
    initializeApp({
      credential: cert(serviceAccount),
      projectId
    }, 'logixt-auth');

  firebaseAuth = getAuth(app);
  return firebaseAuth;
}
