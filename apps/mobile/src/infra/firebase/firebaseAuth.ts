import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from '@firebase/auth';
import type { Auth, Persistence } from '@firebase/auth';

import { getFirebaseApp } from '@infra/firebase/firebaseApp';

let authInstance: Auth | null | undefined;

const getReactNativePersistence = (
  FirebaseAuth as unknown as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

export function getMobileAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }
  if (authInstance !== undefined) {
    return authInstance;
  }

  try {
    authInstance = FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    authInstance = FirebaseAuth.getAuth(app);
  }
  return authInstance;
}
