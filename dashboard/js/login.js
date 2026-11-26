/* ==========================================================================
   ClothStore — Admin Authentication Logic
   Firebase Email/Password Authentication & Dashboard Authorization
   ========================================================================== */

import { auth, db } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { 
  doc, 
  getDoc 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- DOM References ---
const $ = (id) => document.getElementById(id);

const DOM = {
  form: $("loginForm"),
  emailInput: $("loginEmail"),
  passwordInput: $("loginPassword"),
  emailGroup: $("emailGroup"),
  passwordGroup: $("passwordGroup"),
  emailError: $("emailError"),
  passwordError: $("passwordError"),
  errorAlert: $("loginErrorAlert"),
  errorText: $("loginErrorText"),
  submitBtn: $("loginBtn"),
  btnText: $("loginBtnText"),
  btnLoader: $("loginBtnLoader")
};

// Check URL query parameters for unauthorized warnings
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("error") === "unauthorized") {
  showErrorAlert("يرجى تسجيل الدخول بحساب المشرف.");
}

// --- Strict Admin Authorization Check (Custom Claims OR Provisioned /admins/{uid}) ---
async function verifyIsAdmin(user) {
  if (!user) return false;

  try {
    const tokenResult = await user.getIdTokenResult();
    if (tokenResult?.claims?.admin === true || tokenResult?.claims?.role === "admin") {
      return true;
    }
  } catch (err) {
    console.warn("Token claim check warning:", err.message);
  }

  try {
    const adminSnap = await getDoc(doc(db, "admins", user.uid));
    if (adminSnap.exists()) {
      const data = adminSnap.data() || {};
      return data.role === "admin" && data.active !== false;
    }
  } catch (err) {
    console.warn("Admin record verification failed:", err.message);
  }

  return false;
}

// --- Check If Already Authenticated ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const ok = await verifyIsAdmin(user);
    if (ok) {
      window.location.replace("/admin");
    } else {
      await signOut(auth).catch(() => {});
      showErrorAlert("هذا الحساب غير مصرح له بالدخول إلى لوحة الإدارة.");
    }
  }
});

// --- UI Helpers ---
function showErrorAlert(message) {
  DOM.errorText.textContent = message;
  DOM.errorAlert.hidden = false;
}

function hideErrorAlert() {
  DOM.errorText.textContent = "";
  DOM.errorAlert.hidden = true;
}

function clearFieldErrors() {
  DOM.emailGroup.classList.remove("has-error");
  DOM.passwordGroup.classList.remove("has-error");
  DOM.emailError.textContent = "";
  DOM.passwordError.textContent = "";
  hideErrorAlert();
}

function setLoading(isLoading) {
  DOM.submitBtn.disabled = isLoading;
  DOM.btnText.hidden = isLoading;
  DOM.btnLoader.hidden = !isLoading;
  DOM.emailInput.disabled = isLoading;
  DOM.passwordInput.disabled = isLoading;
}

// --- Map Firebase Auth Errors to Arabic ---
function getArabicErrorMessage(errorCode, rawMessage) {
  switch (errorCode) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة. (يرجى التأكد من إنشاء الحساب في Firebase Console -> Authentication -> Users)";
    case "auth/invalid-email":
      return "صيغة البريد الإلكتروني غير صالحة.";
    case "auth/user-disabled":
      return "تم تعطيل هذا الحساب من قِبل مسؤول النظام.";
    case "auth/too-many-requests":
      return "تم إيقاف المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار دقيقة.";
    case "auth/network-request-failed":
      return "تعذر الاتصال بخادم Firebase. يرجى التحقق من اتصالك بالإنترنت.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "مفتاح Firebase API Key غير صالح.";
    default:
      return rawMessage ? `فشل الدخول: ${rawMessage}` : "فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.";
  }
}

// --- Form Submit Handler ---
DOM.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const email = DOM.emailInput.value.trim();
  const password = DOM.passwordInput.value;

  let hasError = false;

  if (!email) {
    DOM.emailGroup.classList.add("has-error");
    DOM.emailError.textContent = "يرجى إدخال البريد الإلكتروني";
    hasError = true;
  }

  if (!password) {
    DOM.passwordGroup.classList.add("has-error");
    DOM.passwordError.textContent = "يرجى إدخال كلمة المرور";
    hasError = true;
  }

  if (hasError) return;

  setLoading(true);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const ok = await verifyIsAdmin(cred.user);
    if (!ok) {
      await signOut(auth).catch(() => {});
      setLoading(false);
      showErrorAlert("هذا الحساب ليس لديه صلاحيات الإدارة المصرح بها.");
      return;
    }
    window.location.replace("/admin");
  } catch (error) {
    console.error("Login failed:", error.code, error.message);
    setLoading(false);
    showErrorAlert(getArabicErrorMessage(error.code, error.message));
  }
});
