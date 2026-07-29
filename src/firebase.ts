import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "inner-surge-m224x",
  appId: "1:627451720112:web:67a5f06e6bb464fb0c2675",
  apiKey: "AIzaSyA7cQ8JgRj0oVdlDEw43U2Szu81a4ixJS0",
  authDomain: "inner-surge-m224x.firebaseapp.com",
  storageBucket: "inner-surge-m224x.firebasestorage.app",
  messagingSenderId: "627451720112"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "ai-studio-f3a6e506-dd16-4b73-ae78-b15e252a469e");
