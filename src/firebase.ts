import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, clearIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentSingleTabManager({})}),
  experimentalForceLongPolling: true
}, (firebaseConfig as any).firestoreDatabaseId);

export const clearFirestoreCache = async () => {
  try {
    await clearIndexedDbPersistence(db);
    window.location.reload();
  } catch (error) {
    console.error("Error clearing Firestore cache", error);
  }
};

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  console.log("signInWithGoogle called");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("signInWithPopup success:", result.user.email);
    return { success: true };
  } catch (error: any) {
    console.error("Error signing in with Google:", error.code, error.message);
    let errorMessage = "Произошла ошибка при входе: " + error.message;
    
    if (error.code === 'auth/popup-blocked') {
      errorMessage = "Пожалуйста, разрешите всплывающие окна для этого сайта, чтобы войти через Google.";
    } else if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = "Окно авторизации было закрыто до завершения входа. Попробуйте еще раз.";
    } else if (error.code === 'auth/unauthorized-domain') {
      errorMessage = "Этот домен не авторизован в настройках Firebase. Пожалуйста, добавьте его в список разрешенных доменов в консоли Firebase.";
    } else if (error.code === 'auth/web-storage-unsupported' || error.message?.includes('missing initial state') || error.message?.includes('sessionStorage')) {
      errorMessage = "Ошибка авторизации. Ваш браузер блокирует сторонние cookie (Third-party cookies). Пожалуйста, отключите блокировку или откройте игру в стандартном браузере (Chrome, Safari), а не внутри мессенджера (Telegram, VK и т.д.).";
    }
    
    return { success: false, error: errorMessage };
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
