import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, setLogLevel } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Configure Firestore with auto-detect long polling for optimal connection resilience
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Suppress internal offline-mode transition warnings so network transitions operate smoothly
setLogLevel("silent");
