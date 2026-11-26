/**
 * Secure Serverless Backend Endpoint: /api/telegram
 * Dispatches verified order notifications ONLY for real existing orders in Firestore.
 *
 * SECURITY FEATURES:
 * 1. Bot token, chat ID, and Service Account are strictly server-side env vars.
 * 2. Verifies orderId actually exists in Firestore "orders" collection via Service Account.
 * 3. Builds notification message strictly from verified Firestore order fields (anti-spoofing).
 * 4. Deduplicates against existing telegramQueue/{orderId} records.
 */

import { adminFirestoreFetch, BASE_FS_URL, hasServiceAccountConfig } from "./firebase-admin.js";
import { enqueueTelegramNotification, fromFirestoreFields, getWorkerSecret } from "./queue-worker.js";

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

function isRateLimited(ip) {
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
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) rateLimitMap.delete(key);
    }
  }
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

function sanitizeText(str) {
  return String(str || "").replace(/[<>]/g, "").trim().slice(0, 200);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientIp = req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || !hasServiceAccountConfig()) {
    return res.status(503).json({
      error: "Telegram notification service is not configured on the server."
    });
  }

  try {
    const { orderId } = req.body || {};
    const safeOrderId = sanitizeText(orderId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!safeOrderId) {
      return res.status(400).json({ error: "Missing or invalid orderId." });
    }

    // 1. Verify order exists in Cloud Firestore (authoritative source of truth)
    const orderRes = await adminFirestoreFetch(`${BASE_FS_URL}/orders/${encodeURIComponent(safeOrderId)}`);
    if (orderRes.status === 404) {
      return res.status(404).json({ error: "Order not found." });
    }
    if (!orderRes.ok) {
      return res.status(502).json({ error: "Failed to verify order record." });
    }

    const orderDoc = await orderRes.json();
    const order = fromFirestoreFields(orderDoc.fields || {});
    if (!order || !order.customer || !Array.isArray(order.items) || order.items.length === 0) {
      return res.status(400).json({ error: "Invalid order record in database." });
    }

    // 2. Deduplicate: avoid re-enqueuing if telegramQueue/{orderId} already exists
    const existingQueueRes = await adminFirestoreFetch(`${BASE_FS_URL}/telegramQueue/${encodeURIComponent(safeOrderId)}`);
    if (existingQueueRes.ok) {
      return res.status(200).json({ success: true, alreadyQueued: true });
    }

    // 3. Build notification strictly from verified Firestore order fields
    const items = order.items;
    const itemCountDesc = `${items.length} عنصر`;
    const itemsBlock = items.map((it) => {
      const sName = sanitizeText(it.name || "منتج");
      const sColor = sanitizeText(it.color || "");
      const sSize = sanitizeText(it.size || "");
      const sQty = Number(it.quantity || it.qty) || 1;
      const sPrice = Number(it.price) || 0;
      const specs = [];
      if (sSize) specs.push(`المقاس: ${sSize}`);
      if (sColor) specs.push(`اللون: ${sColor}`);
      specs.push(`الكمية: ${sQty}`);
      specs.push(`السعر: ${sPrice.toLocaleString("ar-DZ")} دج`);
      return `• ${sName}\n   - ${specs.join(" | ")}`;
    }).join("\n");

    const safeTotal = Number(order.total || 0).toLocaleString("ar-DZ");
    const safeName = sanitizeText(order.customer);
    const safePhone = sanitizeText(order.phone);
    const safeWilaya = sanitizeText(order.wilaya);
    const safeCommune = sanitizeText(order.commune);
    const safeAddress = sanitizeText(order.address || "غير محدد");

    const messageText = [
      "🛍️ طلب جديد من متجر شفق (SHAFQ)",
      "==========================",
      `🔖 رقم الطلب: #${safeOrderId.slice(-6).toUpperCase()}`,
      "",
      `📦 تفاصيل المنتجات (${itemCountDesc}):`,
      itemsBlock,
      "",
      `💰 الإجمالي الكلي: ${safeTotal} دج (الدفع عند التسليم)`,
      "",
      "👤 بيانات الزبون:",
      `• الاسم: ${safeName}`,
      `• رقم الهاتف: ${safePhone}`,
      `• الولاية: ${safeWilaya}`,
      `• البلدية: ${safeCommune}`,
      `• العنوان: ${safeAddress}`,
      "",
      `📅 التاريخ: ${new Date().toLocaleString("ar-DZ")}`
    ].join("\n");

    const queuePayload = {
      orderId: safeOrderId,
      messageText,
      orderSummary: {
        customer: safeName,
        phone: safePhone,
        wilaya: safeWilaya,
        commune: safeCommune,
        deliveryMethod: "الدفع عند التسليم",
        itemsCount: items.length,
        itemsText: itemCountDesc,
        total: safeTotal
      },
      status: "pending",
      attempts: 0,
      createdAt: order.createdAt || new Date().toISOString()
    };

    const queueRes = await enqueueTelegramNotification(queuePayload);

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
        body: JSON.stringify({ trigger: "telegram_fallback", orderId: safeOrderId, timestamp: Date.now() }),
        signal: abortCtrl.signal
      }).catch(() => {}).finally(() => clearTimeout(abortTimer));
    }

    return res.status(200).json({
      success: true,
      queued: Boolean(queueRes && queueRes.success)
    });
  } catch (err) {
    console.error("[TELEGRAM HANDLER EXCEPTION]", err.message);
    return res.status(500).json({ error: "Internal server error while processing notification." });
  }
}
