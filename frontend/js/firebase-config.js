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
  apiKey: "AIzaSyAdWBA6gVpvaFYJKCcrp7eVx7sR90SWMHA",
  authDomain: "hadjadj-store.firebaseapp.com",
  projectId: "hadjadj-store",
  storageBucket: "hadjadj-store.firebasestorage.app",
  messagingSenderId: "974835742070",
  appId: "1:974835742070:web:286f2e7a188303a8993657",
  measurementId: "G-CVN1S422JS"
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
