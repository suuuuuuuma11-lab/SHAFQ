/* ==========================================================================
   ClothStore — Firebase & Cloudinary Central Configuration
   Clean, Modular & Production-Ready Configuration
   ========================================================================== */

// --- Central Firebase Instance (Unified across App & Dashboard) ---
import { app, db, FIREBASE_CONFIG } from "/frontend/js/firebase-config.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

export const auth = getAuth(app);
export { app, db, FIREBASE_CONFIG };

// --- Cloudinary Configuration ---
// Unsigned upload preset for browser direct uploads
export const CLOUDINARY_CONFIG = {
  cloudName: "prwmj9gk",
  uploadPreset: "clothstore_products",
  folder: "products"
};

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
