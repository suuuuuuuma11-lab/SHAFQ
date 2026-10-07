/**
 * Secure Serverless Backend Endpoint: /api/telegram
 * Handles Telegram order notifications securely on the server-side.
 * 
 * SECURITY FEATURES:
 * 1. Bot token and chat ID are read from process.env (NEVER exposed to frontend).
 * 2. Strict input validation and sanitization.
 * 3. In-memory IP rate limiting (max 10 order notifications per IP per minute).
 * 4. Compatible with Vercel Serverless Functions and Node.js HTTP servers.
 */

// Simple in-memory rate limiter per IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
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

  // Periodic cleanup of stale records
  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) rateLimitMap.delete(key);
    }
  }

  return record.count > MAX_REQUESTS_PER_WINDOW;
}

function sanitizeText(str) {
  return String(str || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 200);
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting check
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  // Retrieve secrets from environment
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('[SECURITY ERROR] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in server environment.');
    return res.status(500).json({ error: 'Telegram notification service is not configured on the server.' });
  }

  try {
    const { orderId, orderData } = req.body || {};

    if (!orderId || !orderData) {
      return res.status(400).json({ error: 'Missing required order notification parameters.' });
    }

    // Validate and sanitize data
    const safeOrderId = sanitizeText(orderId).slice(0, 30);
    const safeProductName = sanitizeText(orderData.productName);
    const safeColor = sanitizeText(orderData.color);
    const safeSize = sanitizeText(orderData.size);
    const safeQty = Number(orderData.qty) || 1;
    const safePrice = Number(orderData.price) || 0;
    const safeTotal = sanitizeText(orderData.total);
    const safeName = sanitizeText(orderData.name);
    const safePhone = sanitizeText(orderData.phone);
    const safeWilaya = sanitizeText(orderData.wilaya);
    const safeCommune = sanitizeText(orderData.commune);
    const safeAddress = sanitizeText(orderData.address) || 'لم يُحدد';

    const messageText = [
      '🛍️ طلب جديد من متجر حجاج ',
      '==========================',
      `🔖 رقم الطلب: #${safeOrderId.slice(-6).toUpperCase()}`,
      '',
      '📦 تفاصيل المنتج:',
      `• ${safeProductName}`,
      `  - اللون: ${safeColor}`,
      `  - المقاس: ${safeSize}`,
      `  - الكمية: ${safeQty}`,
      `  - السعر الفردي: ${safePrice} دج`,
      '',
      `💰 الإجمالي الكلي: ${safeTotal} دج (الدفع عند التسليم)`,
      '',
      '👤 بيانات الزبون:',
      `• الاسم: ${safeName}`,
      `• رقم الهاتف: ${safePhone}`,
      `• الولاية: ${safeWilaya}`,
      `• البلدية: ${safeCommune}`,
      `• العنوان: ${safeAddress}`,
      '',
      `📅 التاريخ: ${new Date().toLocaleString('ar-DZ')}`
    ].join('\n');

    // Server-to-server POST to Telegram
    const telegramEndpoint = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(telegramEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText
      })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('[TELEGRAM API ERROR]', result.description || 'Failed to dispatch message');
      return res.status(502).json({ error: 'Failed to dispatch Telegram notification.' });
    }

    return res.status(200).json({ success: true, messageId: result.result?.message_id });
  } catch (err) {
    console.error('[TELEGRAM HANDLER EXCEPTION]', err.message);
    return res.status(500).json({ error: 'Internal server error while processing notification.' });
  }
}
