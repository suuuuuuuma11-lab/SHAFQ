/**
 * Secure Serverless Backend Endpoint: /api/order
 * Authoritative Order & Shipping Price Calculation Endpoint.
 * 
 * BACKEND AUTHORITY PRINCIPLE:
 * 1. Does NOT trust client-submitted shipping prices or order totals.
 * 2. Reads the official active shipping table from Cloud Firestore (or default preset fallback).
 * 3. Identifies the selected Wilaya by code/name.
 * 4. Resolves the official price for the selected delivery method (Home or Stop Desk).
 * 5. Recalculates subtotal and final order total authoritatively.
 * 6. Saves the verified order document to Firestore and triggers notifications.
 */

import { DEFAULT_SHIPPING_RATES } from "../frontend/data/default-shipping-rates.js";
import { ALGERIA_LOCATIONS } from "../frontend/data/algeria-locations.js";
import { adminFirestoreFetch, hasServiceAccountConfig, FIREBASE_PROJECT_ID } from "./firebase-admin.js";
import { enqueueTelegramNotification, fromFirestoreFields, getWorkerSecret } from "./queue-worker.js";

// In-memory rate limiter per IP (Expanded to 150/min to accommodate shared 4G CGNAT networks)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 150;

function isRateLimited(req) {
  const ip = req?.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim() || req?.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count += 1;
  }
  rateLimitMap.set(ip, record);
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetTime) rateLimitMap.delete(k);
    }
  }
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

function sanitizeText(str) {
  return String(str || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 200);
}

function normalizeWilayaCode(val) {
  if (!val) return "";
  const num = parseInt(val, 10);
  if (isNaN(num)) return "";
  return num < 10 ? `0${num}` : `${num}`;
}

function findWilayaData(identifier) {
  if (!identifier) return null;
  const str = String(identifier).trim();
  const code = normalizeWilayaCode(str);
  return ALGERIA_LOCATIONS.find(w =>
    w.code === code ||
    w.name === str ||
    (w.name_latin && w.name_latin.toLowerCase() === str.toLowerCase())
  ) || null;
}

/**
 * Fetches active shipping rates from Cloud Firestore REST API
 */
async function fetchActiveRates() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/shippingSettings/current`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data.fields && data.fields.rates && data.fields.rates.mapValue) {
        const rawRates = data.fields.rates.mapValue.fields || {};
        const rates = {};
        for (const [code, val] of Object.entries(rawRates)) {
          if (val.mapValue && val.mapValue.fields) {
            const f = val.mapValue.fields;
            rates[code] = {
              wilayaCode: code,
              home: Number(f.home?.integerValue || f.home?.doubleValue || 0),
              stopDesk: Number(f.stopDesk?.integerValue || f.stopDesk?.doubleValue || 0)
            };
          }
        }
        if (Object.keys(rates).length > 0) return rates;
      }
    }
  } catch (err) {
    console.warn("[BACKEND SHIPPING] Could not fetch Firestore shipping rates directly:", err.message);
  }

  // Fallback to official default rates
  return DEFAULT_SHIPPING_RATES;
}

/**
 * Fetches an authoritative product record from Cloud Firestore REST API.
 * Uses a per-request Map cache when verifying multi-variant orders.
 */
async function fetchProductFromFirestore(productId, cache) {
  if (!productId) return null;
  if (cache && cache.has(productId)) return cache.get(productId);

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/products/${encodeURIComponent(productId)}`;
  const res = await fetch(url);
  if (res.status === 404) {
    if (cache) cache.set(productId, null);
    return null;
  }
  if (!res.ok) {
    throw new Error(`Firestore product lookup failed (${res.status})`);
  }
  const docJson = await res.json();
  if (!docJson || !docJson.fields) {
    if (cache) cache.set(productId, null);
    return null;
  }
  const parsed = { id: productId, ...fromFirestoreFields(docJson.fields) };
  if (cache) cache.set(productId, parsed);
  return parsed;
}

/**
 * Converts a standard JS object to Firestore REST API fields
 */
function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "number") {
      fields[key] = Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map(item => ({
            mapValue: { fields: toFirestoreFields(item) }
          }))
        }
      };
    } else if (typeof val === "object") {
      fields[key] = {
        mapValue: { fields: toFirestoreFields(val) }
      };
    }
  }
  return fields;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  }

  try {
    const body = req.body || {};
    const {
      customer,
      phone,
      wilaya,
      wilayaCode,
      commune,
      communeCode,
      address,
      deliveryMethod,
      items
    } = body;

    // 1. Basic Field Validation
    const cleanName = sanitizeText(customer);
    const cleanPhone = String(phone || "").trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    const cleanCommune = sanitizeText(commune);
    const cleanAddress = sanitizeText(address || "");

    if (!cleanName || cleanName.length < 3) {
      return res.status(400).json({ error: "الاسم الكامل غير صالح (3 أحرف على الأقل)" });
    }

    if (!/^0[5-7][0-9]{8}$/.test(cleanPhone)) {
      return res.status(400).json({ error: "رقم الهاتف غير صالح" });
    }

    // 2. Identify Selected Wilaya & Commune
    const wilayaInfo = findWilayaData(wilayaCode || wilaya);
    if (!wilayaInfo) {
      return res.status(400).json({ error: "الولاية المحددة غير صحيحة" });
    }
    if (!cleanCommune || cleanCommune.length < 2) {
      return res.status(400).json({ error: "يرجى تحديد البلدية" });
    }

    // 3. Authority: Read Official Rates and Calculate Shipping Price
    const activeRates = await fetchActiveRates();
    const rateForWilaya = activeRates[wilayaInfo.code] || (DEFAULT_SHIPPING_RATES[wilayaInfo.code]);

    const method = deliveryMethod === "stopDesk" ? "stopDesk" : "home";
    const verifiedShippingPrice = Number(
      (rateForWilaya && typeof rateForWilaya[method] === "number")
        ? rateForWilaya[method]
        : (method === "stopDesk" ? 400 : 600)
    );

    // 4. Authority: Fetch Products from Firestore, Validate Availability/Variants/Qty & Recalculate Subtotal
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "لا توجد منتجات في الطلب" });
    }
    if (items.length > 20) {
      return res.status(400).json({ error: "تجاوز الطلب الحد الأقصى للمنتجات (20 منتجاً)" });
    }

    const productCache = new Map();
    let verifiedSubtotal = 0;
    const sanitizedItems = [];

    for (const it of items) {
      const productId = sanitizeText(it?.productId || "");
      if (!productId) {
        return res.status(400).json({ error: "معرّف المنتج مفقود" });
      }

      const rawQty = Number(it?.quantity ?? it?.qty);
      if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 50) {
        return res.status(400).json({ error: "كمية المنتج غير صالحة (يجب أن تكون بين 1 و 50)" });
      }

      const prod = await fetchProductFromFirestore(productId, productCache);
      if (!prod) {
        return res.status(400).json({ error: `المنتج غير موجود في قاعدة البيانات (${productId})` });
      }

      if (String(prod.status || "active").trim().toLowerCase() === "hidden") {
        return res.status(400).json({ error: `المنتج "${sanitizeText(prod.name)}" غير متوفر حالياً` });
      }

      const authPrice = Number(prod.price);
      if (!Number.isFinite(authPrice) || authPrice <= 0) {
        return res.status(400).json({ error: `سعر المنتج غير صالح في قاعدة البيانات (${productId})` });
      }

      // Validate size against Firestore product sizes
      const allowedSizes = Array.isArray(prod.sizes)
        ? prod.sizes.map(s => String(s || "").trim()).filter(Boolean)
        : [];
      const reqSize = sanitizeText(it?.size || "");
      let matchedSize = "";
      if (allowedSizes.length > 0) {
        const foundSize = allowedSizes.find(s => s.toLowerCase() === reqSize.toLowerCase());
        if (!foundSize) {
          return res.status(400).json({ error: `المقاس المحدد غير متوفر للمنتج "${sanitizeText(prod.name)}"` });
        }
        matchedSize = foundSize;
      }

      // Validate color if product defines colors
      const rawColors = Array.isArray(prod.colors) ? prod.colors : [];
      const allowedColors = rawColors
        .map((c, idx) => {
          if (typeof c === "object" && c !== null) {
            return { name: String(c.name || "").trim(), value: String(c.value || "#1d1a16").trim() };
          }
          const fallbackName = Array.isArray(prod.colorNames) && prod.colorNames[idx] ? String(prod.colorNames[idx]).trim() : "";
          return { name: fallbackName || String(c || "").trim(), value: String(c || "#1d1a16").trim() };
        })
        .filter(c => c.name);

      const reqColor = sanitizeText(it?.color || "");
      let matchedColor = reqColor;
      let matchedColorHex = sanitizeText(it?.colorHex || "");
      if (allowedColors.length > 0) {
        const foundColor = allowedColors.find(c => c.name.toLowerCase() === reqColor.toLowerCase());
        if (!foundColor) {
          return res.status(400).json({ error: `اللون المحدد غير متوفر للمنتج "${sanitizeText(prod.name)}"` });
        }
        matchedColor = foundColor.name;
        matchedColorHex = foundColor.value || matchedColorHex;
      }

      const authName = sanitizeText(prod.name || prod.title || "منتج");
      const authImage = sanitizeText(prod.mainImage || prod.img || "");

      verifiedSubtotal += authPrice * rawQty;
      sanitizedItems.push({
        productId,
        name: authName,
        price: authPrice,
        quantity: rawQty,
        size: matchedSize,
        color: matchedColor,
        colorHex: matchedColorHex,
        image: authImage
      });
    }

    const verifiedTotal = verifiedSubtotal + verifiedShippingPrice;

    // 5. Construct Authoritative Order Record
    const orderPayload = {
      customer: cleanName,
      phone: cleanPhone,
      wilaya: wilayaInfo.name,
      commune: cleanCommune || wilayaInfo.name,
      address: cleanAddress,
      deliveryMethod: method,
      shippingPrice: verifiedShippingPrice,
      subtotal: verifiedSubtotal,
      total: verifiedTotal,
      shipping: {
        method: method,
        wilayaCode: wilayaInfo.code,
        communeCode: communeCode ? String(communeCode) : "",
        price: verifiedShippingPrice
      },
      items: sanitizedItems,
      paymentMethod: "الدفع عند الاستلام",
      status: "جديد",
      createdAt: new Date().toISOString()
    };

    // Fail closed if Server Firebase Service Account is not configured
    if (!hasServiceAccountConfig()) {
      return res.status(503).json({
        success: false,
        error: "خدمة الطلبات غير مهيأة حالياً على الخادم (Service Account)."
      });
    }

    // 6. Write Order to Cloud Firestore via Service Account (Authoritative Source of Truth)
    let createdOrderId = null;
    try {
      const fsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders`;
      const fsRes = await adminFirestoreFetch(fsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: toFirestoreFields(orderPayload) })
      });

      if (!fsRes.ok) {
        const errBody = await fsRes.text();
        console.error("[BACKEND ORDER WRITE ERROR]:", errBody);
        return res.status(500).json({
          success: false,
          error: "تعذر تسجيل الطلب في قاعدة البيانات. يرجى المحاولة مرة أخرى."
        });
      }

      const docResult = await fsRes.json();
      if (docResult && docResult.name) {
        createdOrderId = docResult.name.split("/").pop();
      } else {
        throw new Error("لم يتم استلام معرف الطلب من Firestore");
      }
    } catch (fsErr) {
      console.error("[BACKEND ORDER WRITE EXCEPTION]:", fsErr.message);
      return res.status(500).json({
        success: false,
        error: "حدث خطأ أثناء حفظ الطلب في قاعدة البيانات. يرجى المحاولة مرة أخرى."
      });
    }

    // 7. Enqueue Telegram Notification Reliably & Trigger Asynchronous Worker
    let telegramEnqueued = false;
    try {
      const methodDesc = method === "home" ? "توصيل للمنزل" : "استلام من المكتب";
      const itemsText = sanitizedItems.map(it => {
        const details = [];
        if (it.size) details.push(`المقاس: ${it.size}`);
        if (it.color) details.push(`اللون: ${it.color}`);
        details.push(`الكمية: ${it.quantity}`);
        details.push(`السعر: ${it.price.toLocaleString("ar-DZ")} دج`);
        return `• ${it.name}\n   - ${details.join(" | ")}`;
      }).join("\n");

      const msg = [
        "🛍️ طلب جديد من متجر شفق (SHAFQ)",
        "==========================",
        `🔖 رقم الطلب: #${createdOrderId.slice(-6).toUpperCase()}`,
        "",
        `📦 تفاصيل المنتجات (${sanitizedItems.length}):`,
        itemsText,
        "",
        `🚚 طريقة التوصيل: ${methodDesc}`,
        `💵 سعر المنتجات: ${verifiedSubtotal.toLocaleString("ar-DZ")} دج`,
        `🚚 سعر التوصيل: ${verifiedShippingPrice.toLocaleString("ar-DZ")} دج`,
        `💰 الإجمالي الكلي: ${verifiedTotal.toLocaleString("ar-DZ")} دج (الدفع عند التسليم)`,
        "",
        "👤 بيانات الزبون:",
        `• الاسم: ${cleanName}`,
        `• رقم الهاتف: ${cleanPhone}`,
        `• الولاية: ${wilayaInfo.code} — ${wilayaInfo.name}`,
        `• البلدية: ${cleanCommune}`,
        `• العنوان: ${cleanAddress || "غير محدد"}`,
        "",
        `📅 التاريخ: ${new Date().toLocaleString("ar-DZ")}`
      ].join("\n");

      const queuePayload = {
        orderId: createdOrderId,
        messageText: msg,
        orderSummary: {
          customer: cleanName,
          phone: cleanPhone,
          wilaya: `${wilayaInfo.code} — ${wilayaInfo.name}`,
          commune: cleanCommune,
          deliveryMethod: methodDesc,
          itemsCount: sanitizedItems.length,
          itemsText: sanitizedItems.map(it => `${it.name}${it.size ? ` (${it.size})` : ""}${it.color ? ` - ${it.color}` : ""} x${it.quantity}`).join("، "),
          total: verifiedTotal
        },
        status: "pending",
        createdAt: new Date().toISOString()
      };

      const queueRes = await enqueueTelegramNotification(queuePayload);
      telegramEnqueued = Boolean(queueRes && queueRes.success);

      // Trigger queue worker asynchronously without delaying customer confirmation
      const workerSecret = getWorkerSecret();
      if (workerSecret) {
        const host = req.headers?.host || "localhost";
        const proto = req.headers?.["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
        const triggerNextUrl = `${proto}://${host}/api/queue-worker`;

        const abortCtrl = new AbortController();
        const abortTimer = setTimeout(() => abortCtrl.abort(), 250);

        fetch(triggerNextUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-secret": workerSecret
          },
          body: JSON.stringify({ trigger: "new_order", orderId: createdOrderId, timestamp: Date.now() }),
          signal: abortCtrl.signal
        }).catch(() => {}).finally(() => clearTimeout(abortTimer));
      }

    } catch (tgErr) {
      console.warn("[TELEGRAM ENQUEUE WARNING]:", tgErr.message);
    }

    // Customer receives confirmed response immediately after Firestore save succeeds
    return res.status(200).json({
      success: true,
      orderId: createdOrderId,
      order: orderPayload,
      telegramSent: telegramEnqueued,
      status: "confirmed"
    });

  } catch (err) {
    console.error("[ORDER HANDLER EXCEPTION]:", err);
    return res.status(500).json({ error: "حدث خطأ غير متوقع أثناء معالجة الطلب" });
  }
}
