import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null | undefined;

function missingFirebaseConfigKeys() {
  return [
    ['EXPO_PUBLIC_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
    ['EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
    ['EXPO_PUBLIC_FIREBASE_APP_ID', firebaseConfig.appId],
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
