/* ==========================================================================
   ClothStore — Admin Authentication Logic
   Firebase Email/Password Authentication & Redirection
   ========================================================================== */

import { auth } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

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

// --- Check If Already Authenticated ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Already logged in, redirect straight to admin dashboard
    window.location.replace("admin.html");
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
function getArabicErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    case "auth/invalid-email":
      return "صيغة البريد الإلكتروني غير صالحة.";
    case "auth/user-disabled":
      return "تم تعطيل هذا الحساب من قِبل مسؤول النظام.";
    case "auth/too-many-requests":
      return "تم إيقاف المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار.";
    case "auth/network-request-failed":
      return "تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "مفتاح Firebase API Key غير صالح. يرجى ضبط المفتاح في firebase-config.js.";
    default:
      return "فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.";
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
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle redirection or redirect immediately:
    window.location.replace("admin.html");
  } catch (error) {
    console.error("Login failed:", error);
    setLoading(false);
    showErrorAlert(getArabicErrorMessage(error.code));
  }
});
