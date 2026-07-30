"use client";

const CLIENT_ID_KEY = "clavisflow-studio:anonymous-client-id:v1";

export function browserClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) return existing.toLowerCase();
  const created = crypto.randomUUID().replaceAll("-", "");
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}
