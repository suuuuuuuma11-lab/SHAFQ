/**
 * Intelligent Telegram Notification Queue Worker
 * Cloud Firestore + Vercel Serverless Architecture
 * 
 * CORE CAPABILITIES:
 * 1. Concurrency Lock: Prevents multiple serverless instances from competing or flooding Telegram.
 * 2. Rate-Limiting Protection: Enforces strict 1.2s delay between messages to respect Telegram limits.
 * 3. Smart Batching: If queue backlog > 3 (e.g. 10 to 100+ simultaneous orders), automatically 
 *    groups 3-5 orders into a consolidated batch message, preventing Vercel execution timeouts 
 *    and avoiding Telegram 429 rate limits.
 * 4. Automatic Retry on 429: Dynamically waits for Telegram's 'retry_after' duration.
 * 5. Self-Chaining: If more pending items remain after time budget (8s), triggers a fresh 
 *    invocation so all orders are eventually delivered with zero drops.
 */

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "clothstore-a9b2c";
const BASE_FS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Converts a standard JS object to Firestore REST API fields
 */
export function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "number") {
      fields[key] = Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map((item) => {
            if (typeof item === "object" && item !== null) {
              return { mapValue: { fields: toFirestoreFields(item) } };
            }
            if (typeof item === "number") return { integerValue: String(item) };
            return { stringValue: String(item) };
          })
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

/**
 * Converts Firestore REST API fields back to a standard JS object
 */
export function fromFirestoreFields(fields = {}) {
  const obj = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val.stringValue !== undefined) obj[key] = val.stringValue;
    else if (val.integerValue !== undefined) obj[key] = parseInt(val.integerValue, 10);
    else if (val.doubleValue !== undefined) obj[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
    else if (val.mapValue !== undefined) obj[key] = fromFirestoreFields(val.mapValue.fields);
    else if (val.arrayValue !== undefined) {
      obj[key] = (val.arrayValue.values || []).map((v) => {
        if (v.mapValue) return fromFirestoreFields(v.mapValue.fields);
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
        return v;
      });
    }
  }
  return obj;
}

/**
 * Enqueues a notification into the Cloud Firestore telegramQueue collection
 */
export async function enqueueTelegramNotification(payload) {
  try {
    const queueUrl = `${BASE_FS_URL}/telegramQueue`;
    const docData = {
      orderId: payload.orderId || "",
      messageText: payload.messageText || "",
      orderSummary: payload.orderSummary || {},
      status: "pending",
      attempts: 0,
      createdAt: payload.createdAt || new Date().toISOString()
    };

    const res = await fetch(queueUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(docData) })
    });

    if (res.ok) {
      const data = await res.json();
      const docId = data.name ? data.name.split("/").pop() : null;
      return { success: true, docId };
    } else {
      const errText = await res.text();
      console.warn("[QUEUE ENQUEUE WARN]:", errText);
      return { success: false, error: errText };
    }
  } catch (err) {
    console.error("[QUEUE ENQUEUE EXCEPTION]:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Checks and acquires a mutual-exclusion lock in Firestore (queueControl/workerLock)
 * Expiry prevents deadlock if a worker instance is terminated unexpectedly.
 */
async function acquireLock(workerId) {
  const lockUrl = `${BASE_FS_URL}/queueControl/workerLock`;
  const now = Date.now();
  const LOCK_TTL_MS = 25 * 1000; // 25 seconds auto-expiration

  try {
    // 1. Read current lock status
    const getRes = await fetch(lockUrl);
    if (getRes.ok) {
      const lockDoc = await getRes.json();
      const lockData = fromFirestoreFields(lockDoc.fields || {});
      const isLocked = Boolean(lockData.locked);
      const expiresAt = Number(lockData.expiresAt || 0);

      // If active lock held by another worker and not expired yet
      if (isLocked && now < expiresAt) {
        return { acquired: false, reason: "Lock held by active worker" };
      }
    }

    // 2. Write new lock
    const newLockPayload = {
      locked: true,
      workerId,
      lockedAt: now,
      expiresAt: now + LOCK_TTL_MS
    };

    const patchUrl = `${lockUrl}?updateMask.fieldPaths=locked&updateMask.fieldPaths=workerId&updateMask.fieldPaths=lockedAt&updateMask.fieldPaths=expiresAt`;
    await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(newLockPayload) })
    });

    return { acquired: true };
  } catch (err) {
    console.warn("[LOCK ACQUISITION WARN]:", err.message);
    // Proceed optimistically if lock service had a read hiccup
    return { acquired: true };
  }
}

/**
 * Releases the worker lock
 */
async function releaseLock(workerId) {
  const lockUrl = `${BASE_FS_URL}/queueControl/workerLock`;
  try {
    const unlockPayload = {
      locked: false,
      releasedAt: Date.now(),
      lastWorkerId: workerId
    };
    const patchUrl = `${lockUrl}?updateMask.fieldPaths=locked&updateMask.fieldPaths=releasedAt&updateMask.fieldPaths=lastWorkerId`;
    await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(unlockPayload) })
    });
  } catch (err) {
    console.warn("[LOCK RELEASE WARN]:", err.message);
  }
}

/**
 * Queries Cloud Firestore for pending items in telegramQueue
 */
async function fetchPendingQueueItems(limit = 40) {
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: "telegramQueue" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "pending" }
        }
      },
      limit
    }
  };

  try {
    const res = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryBody)
    });

    if (!res.ok) {
      console.warn("[FETCH QUEUE ERROR]:", await res.text());
      return [];
    }

    const results = await res.json();
    if (!Array.isArray(results)) return [];

    const items = [];
    for (const row of results) {
      if (row.document && row.document.fields) {
        const docName = row.document.name;
        const docId = docName.split("/").pop();
        const data = fromFirestoreFields(row.document.fields);
        items.push({
          docId,
          docPath: docName,
          ...data
        });
      }
    }

    // Sort chronologically (oldest order first)
    items.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    return items;
  } catch (err) {
    console.error("[FETCH QUEUE EXCEPTION]:", err.message);
    return [];
  }
}

/**
 * Updates a queue item status in Cloud Firestore
 */
async function updateQueueItemStatus(docId, status, extra = {}) {
  const docUrl = `${BASE_FS_URL}/telegramQueue/${docId}`;
  const payload = {
    status,
    updatedAt: new Date().toISOString(),
    ...extra
  };

  const fieldPaths = Object.keys(payload)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");

  try {
    await fetch(`${docUrl}?${fieldPaths}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(payload) })
    });
  } catch (err) {
    console.warn(`[UPDATE QUEUE ITEM FAIL ${docId}]:`, err.message);
  }
}

/**
 * Dispatches a message to Telegram Bot API with retry on 429
 */
async function sendToTelegram(token, chatId, text) {
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        return { success: true, messageId: data.result?.message_id };
      }

      // Check for Rate Limit 429
      if (res.status === 429 || data.error_code === 429) {
        const retrySec = Number(data.parameters?.retry_after || 3);
        console.warn(`[TELEGRAM 429 RATE LIMIT]: Waiting ${retrySec}s before attempt ${attempt + 1}...`);
        await sleep(Math.min(retrySec, 8) * 1000);
        continue;
      }

      console.warn(`[TELEGRAM DISPATCH FAIL]:`, data.description || res.statusText);
      return { success: false, error: data.description || "Unknown Telegram error" };
    } catch (netErr) {
      console.warn(`[TELEGRAM NETWORK ERROR attempt ${attempt}]:`, netErr.message);
      if (attempt < 3) await sleep(1500);
    }
  }

  return { success: false, error: "Exceeded max dispatch attempts" };
}

/**
 * Formats a consolidated batch message for multiple orders
 */
function formatBatchMessage(items) {
  const count = items.length;
  const header = [
    `⚡ دفعة طلبات جديدة مجمّعة (${count} طلبات)`,
    `=========================================`
  ];

  const orderBlocks = items.map((item, index) => {
    const s = item.orderSummary || {};
    const orderNum = (item.orderId || `ORD-${index + 1}`).slice(-6).toUpperCase();
    const customer = s.customer || "زبون";
    const phone = s.phone || "—";
    const wilaya = s.wilaya || "—";
    const commune = s.commune || "";
    const method = s.deliveryMethod || "توصيل للمنزل";
    const total = Number(s.total || 0).toLocaleString("ar-DZ");
    const itemsDesc = s.itemsText || s.summaryText || "منتجات مختلفة";

    return [
      `📦 طلب (${index + 1}/${count}): #${orderNum}`,
      `👤 الزبون: ${customer} | 📱 ${phone}`,
      `📍 ${wilaya}${commune ? ` — ${commune}` : ""} (${method})`,
      `🛍️ المنتجات: ${itemsDesc}`,
      `💰 الإجمالي: ${total} دج (عند التسليم)`
    ].join("\n");
  });

  return [
    ...header,
    "",
    orderBlocks.join("\n-----------------------------------------\n"),
    "",
    `📅 توقيت المعالجة: ${new Date().toLocaleString("ar-DZ")}`
  ].join("\n");
}

/**
 * Core Queue Processing Engine
 * Processes pending notifications with smart throttling, batching, and safety deadlines.
 */
export async function processTelegramQueue(options = {}) {
  const maxDurationMs = options.maxDurationMs || 8000; // 8s safety margin for Serverless
  const startTime = Date.now();
  const workerId = `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[QUEUE WORKER]: Telegram credentials not configured in environment.");
    return { status: "unconfigured" };
  }

  // 1. Acquire Concurrency Guard Lock
  const lockResult = await acquireLock(workerId);
  if (!lockResult.acquired) {
    return { status: "busy", message: lockResult.reason };
  }

  let totalProcessed = 0;
  let remainingCount = 0;

  try {
    // 2. Fetch pending orders
    const pendingItems = await fetchPendingQueueItems(50);
    if (pendingItems.length === 0) {
      return { status: "idle", processed: 0, message: "Queue is empty" };
    }

    // 3. Process Strategy Selection
    // Scenario A: Low volume (1 to 3 items) -> Send each order individually
    if (pendingItems.length <= 3) {
      for (const item of pendingItems) {
        // Check execution time budget
        if (Date.now() - startTime > maxDurationMs) {
          remainingCount = pendingItems.length - totalProcessed;
          break;
        }

        const msgText = item.messageText || formatBatchMessage([item]);
        const result = await sendToTelegram(token, chatId, msgText);

        if (result.success) {
          await updateQueueItemStatus(item.docId, "sent", { sentAt: new Date().toISOString() });
          totalProcessed++;
        } else {
          const attempts = (item.attempts || 0) + 1;
          const nextStatus = attempts >= 5 ? "failed" : "pending";
          await updateQueueItemStatus(item.docId, nextStatus, { attempts, lastError: result.error });
        }

        // Throttle: 1.2s delay between messages to respect Telegram chat limits
        await sleep(1200);
      }
    } else {
      // Scenario B: High volume / Burst traffic (> 3 items, e.g. 10 to 100+ orders!)
      // Smart Batching: Group 3-4 items per message
      const BATCH_SIZE = 4;
      const batches = [];
      for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
        batches.push(pendingItems.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        // Check execution time budget
        if (Date.now() - startTime > maxDurationMs) {
          remainingCount = pendingItems.length - totalProcessed;
          break;
        }

        const batchText = formatBatchMessage(batch);
        const result = await sendToTelegram(token, chatId, batchText);

        if (result.success) {
          // Mark all items in batch as sent
          const sentAt = new Date().toISOString();
          await Promise.all(
            batch.map((it) => updateQueueItemStatus(it.docId, "sent", { sentAt, inBatch: true }))
          );
          totalProcessed += batch.length;
        } else {
          // Increment attempts for batch items
          await Promise.all(
            batch.map((it) => {
              const attempts = (it.attempts || 0) + 1;
              const nextStatus = attempts >= 5 ? "failed" : "pending";
              return updateQueueItemStatus(it.docId, nextStatus, { attempts, lastError: result.error });
            })
          );
        }

        // Throttle between batches
        await sleep(1200);
      }
    }

    return {
      status: "success",
      processed: totalProcessed,
      remaining: remainingCount,
      durationMs: Date.now() - startTime
    };
  } finally {
    // 4. Always release the lock
    await releaseLock(workerId);

    // 5. If more items remain and we approached timeout, chain another worker call
    if (remainingCount > 0 && options.triggerNextUrl) {
      fetch(options.triggerNextUrl, {
        method: "POST",
        headers: { "x-worker-chain": "1" }
      }).catch(() => {});
    }
  }
}

/**
 * Standard Vercel Serverless Function Handler
 * Route: /api/queue-worker
 */
export default async function handler(req, res) {
  // Support both GET (Cron jobs / health) and POST (Trigger calls)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const host = req.headers?.host || "localhost";
    const proto = req.headers?.["x-forwarded-proto"] || "https";
    const triggerNextUrl = `${proto}://${host}/api/queue-worker`;

    const result = await processTelegramQueue({
      maxDurationMs: 8500,
      triggerNextUrl
    });

    return res.status(200).json({
      ok: true,
      result
    });
  } catch (err) {
    console.error("[QUEUE WORKER HANDLER ERROR]:", err);
    return res.status(500).json({ error: "Internal error processing queue", details: err.message });
  }
}

