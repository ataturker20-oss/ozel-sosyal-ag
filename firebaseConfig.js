import { initializeApp } from "firebase/app";
// initializeAuth ve persistence'i import et
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// Bu paketi yüklediğinden emin ol: npx expo install @react-native-async-storage/async-storage
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
const firebaseConfig = {
  apiKey: "AIzaSyAGLVmm7TesER2tV9E1lbBF4NkEr1Hh2Ck",
  authDomain: "turkers-app.firebaseapp.com",
  projectId: "turkers-app",
  storageBucket: "turkers-app.firebasestorage.app",
  messagingSenderId: "811549355962",
  appId: "1:811549355962:web:fc254590f6b76c7a5d7783",
  measurementId: "G-G52D8HPW30"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ÖNEMLİ OLAN BU KISIM:
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);