/**
 * SHAFQ — Server-Side Firebase Service Account REST Client
 * Zero-dependency OAuth2 JWT signer using Node.js built-in crypto.
 *
 * Reads credentials strictly from server environment variables:
 *   - FIREBASE_SERVICE_ACCOUNT_JSON (JSON string of Service Account key)
 *   OR
 *   - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   - FIREBASE_PROJECT_ID (optional, defaults to "clothstore-a9b2c")
 *
 * NEVER import this file in frontend/ or dashboard/.
 */

import { createSign } from "node:crypto";

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "clothstore-a9b2c";
export const BASE_FS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function getServiceAccountCredentials() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed && parsed.client_email && parsed.private_key) {
        return {
          clientEmail: String(parsed.client_email).trim(),
          privateKey: String(parsed.private_key).replace(/\\n/g, "\n"),
          projectId: String(parsed.project_id || FIREBASE_PROJECT_ID).trim()
        };
      }
    } catch (_) {
      return null;
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      clientEmail: String(clientEmail).trim(),
      privateKey: String(privateKey).replace(/\\n/g, "\n"),
      projectId: FIREBASE_PROJECT_ID
    };
  }

  return null;
}

export function hasServiceAccountConfig() {
  return Boolean(getServiceAccountCredentials());
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getAdminAccessToken() {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && nowSec < cachedTokenExpiresAt - 300) {
    return cachedToken;
  }

  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new Error("Firebase Service Account credentials are not configured on the server.");
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: nowSec + 3600,
      iat: nowSec
    })
  );

  const unsignedJwt = `${header}.${claimSet}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer
    .sign(creds.privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`OAuth2 token exchange failed (${tokenRes.status}): ${errText.slice(0, 120)}`);
  }

  const tokenData = await tokenRes.json();
  if (!tokenData || !tokenData.access_token) {
    throw new Error("OAuth2 response missing access_token.");
  }

  cachedToken = tokenData.access_token;
  cachedTokenExpiresAt = nowSec + Number(tokenData.expires_in || 3600);
  return cachedToken;
}

/**
 * Performs an authenticated Firestore REST API request using the Service Account Bearer token.
 * Fails closed if Service Account credentials are not configured.
 */
export async function adminFirestoreFetch(urlOrPath, init = {}) {
  const token = await getAdminAccessToken();
  const url = String(urlOrPath).startsWith("https://")
    ? urlOrPath
    : `${BASE_FS_URL}${String(urlOrPath).startsWith("/") ? "" : "/"}${urlOrPath}`;

  const headers = {
    ...(init.headers || {}),
    Authorization: `Bearer ${token}`
  };

  return fetch(url, { ...init, headers });
}
