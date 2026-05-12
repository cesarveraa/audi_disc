import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null | undefined;

function missingFirebaseConfigKeys() {
  return [
    ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['VITE_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
    ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function initializeFirebaseApp(): FirebaseApp | null {
  if (firebaseApp !== undefined) {
    return firebaseApp;
  }

  const missingKeys = missingFirebaseConfigKeys();
  if (missingKeys.length > 0) {
    console.error(`[AudiDisc Firebase] Faltan variables de entorno: ${missingKeys.join(', ')}`);
    firebaseApp = null;
    return null;
  }

  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  console.log("🔥 Firebase inicializado correctamente");
  return firebaseApp;
}

export function getFirebaseApp(): FirebaseApp | null {
  return initializeFirebaseApp();
}
