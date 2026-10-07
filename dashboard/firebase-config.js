/* ==========================================================================
   ClothStore — Firebase & Cloudinary Central Configuration
   Clean, Modular & Production-Ready Configuration
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- Firebase Web Configuration ---
// Note: Standard browser Firebase Web configuration (Public client credentials)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBRdA4z-1aiZ91CGXkvqgMw_MuSK8WpG94",
  authDomain: "clothstore-a9b2c.firebaseapp.com",
  projectId: "clothstore-a9b2c",
  storageBucket: "clothstore-a9b2c.firebasestorage.app",
  messagingSenderId: "1053402231825",
  appId: "1:1053402231825:web:04a1eeafdb355f01f0adb0",
  measurementId: "G-QW1T59Y9WN"
};

// --- Cloudinary Configuration ---
// Unsigned upload preset for browser direct uploads
export const CLOUDINARY_CONFIG = {
  cloudName: "prwmj9gk",
  uploadPreset: "clothstore_products",
  folder: "products"
};

// --- Initialize Firebase Services with Multi-Tab Browser Persistence ---
export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (err) {
  // Fallback to memory / default cache if already initialized or restricted mode
  console.info("Firestore persistence initialized or fallback:", err?.message || err);
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

// --- Cloudinary Unsigned Image Upload Helper ---
/**
 * Uploads an image file directly from the browser to Cloudinary.
 * Returns the secure HTTPS URL of the uploaded asset.
 * @param {File} file - The image file to upload
 * @returns {Promise<string>} Cloudinary secure URL
 */
export async function uploadImageToCloudinary(file) {
  if (!CLOUDINARY_CONFIG.cloudName || CLOUDINARY_CONFIG.cloudName === "YOUR_CLOUDINARY_CLOUD_NAME") {
    throw new Error("يرجى ضبط اسم سحابة Cloudinary (cloudName) في ملف firebase-config.js");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  if (CLOUDINARY_CONFIG.folder) {
    formData.append("folder", CLOUDINARY_CONFIG.folder);
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CONFIG.cloudName)}/image/upload`;

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || "";
    } catch (_) {}
    throw new Error(errorDetail || `فشل رفع الصورة (كود: ${response.status})`);
  }

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("لم يتم استلام رابط الصورة من Cloudinary");
  }

  return data.secure_url;
}
