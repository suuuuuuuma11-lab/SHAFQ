/* ==========================================================================
   ClothStore — Frontend Firebase Central Configuration
   Modular SDK v10 with Multi-Tab Browser Persistence
   ========================================================================== */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDPuikSEpqgNdbZU9QjKk3xKx5s-pofGoA",
  authDomain: "hadjaj-store-c8148.firebaseapp.com",
  projectId: "hadjaj-store-c8148",
  storageBucket: "hadjaj-store-c8148.firebasestorage.app",
  messagingSenderId: "150316198302",
  appId: "1:150316198302:web:59097cea1b6090d1bece8f",
  measurementId: "G-MTZLNR69JP"
};

export const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (_) {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
