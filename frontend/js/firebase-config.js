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
  apiKey: "AIzaSyBRdA4z-1aiZ91CGXkvqgMw_MuSK8WpG94",
  authDomain: "clothstore-a9b2c.firebaseapp.com",
  projectId: "clothstore-a9b2c",
  storageBucket: "clothstore-a9b2c.firebasestorage.app",
  messagingSenderId: "1053402231825",
  appId: "1:1053402231825:web:04a1eeafdb355f01f0adb0",
  measurementId: "G-QW1T59Y9WN"
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
