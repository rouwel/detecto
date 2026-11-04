export const ALLOWED_TYPES = ["image/jpeg", "image/png", "video/mp4"];
export const ALLOWED_EXTENSIONS = /\.(jpe?g|png|mp4)$/i;
export const MAX_MB = 50;

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export function validateFile(file) {
  if (!file) return "No file selected.";

  const typeOk = ALLOWED_TYPES.includes(file.type);
  const extensionOk = ALLOWED_EXTENSIONS.test(file.name || "");
  if (!typeOk && !extensionOk) {
    return `Unsupported file type "${file.type || "unknown"}". Use JPG, PNG or MP4.`;
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_MB * 1024 * 1024) return `File is too large (max ${MAX_MB} MB).`;
  return null;
}

async function errorFrom(res, fallback) {
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  return typeof detail === "string" ? detail : `${fallback} (${res.status})`;
}

export async function detect(blob, filename, signal) {
  const body = new FormData();
  body.append("file", blob, filename);
  const res = await fetch(`${API_BASE}/detect`, { method: "POST", body, signal });
  if (!res.ok) throw new Error(await errorFrom(res, "Detection failed"));
  return res.json();
}

export async function getHistory(limit = 1000, signal) {
  const res = await fetch(`${API_BASE}/history?limit=${limit}`, { signal });
  if (!res.ok) throw new Error(await errorFrom(res, "Could not load history"));
  return res.json(); // { detections: [...], stats: {...} }
}

export async function resetHistory() {
  const res = await fetch(`${API_BASE}/reset`, { method: "POST" });
  if (!res.ok) throw new Error(await errorFrom(res, "Could not clear history"));
}

export async function getHealth(signal) {
  const res = await fetch(`${API_BASE}/health`, { signal });
  if (!res.ok) throw new Error(await errorFrom(res, "Backend is unavailable"));
  return res.json();
}
