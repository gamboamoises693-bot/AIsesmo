// Client for the Next.js JARVIS backend. The Anthropic API key lives ONLY on that server;
// never put it in the mobile app (anyone can extract it from the APK).

import type { ChatTurn, JarvisError, JarvisResponse } from "./types";

const API_URL = process.env.EXPO_PUBLIC_JARVIS_API_URL?.replace(/\/+$/, "");
const TIMEOUT_MS = 45_000;

export async function askJarvis(params: {
  message: string;
  history: ChatTurn[];
  memories: string[];
}): Promise<JarvisResponse> {
  if (!API_URL) {
    throw new Error("EXPO_PUBLIC_JARVIS_API_URL is not set. Check your .env file.");
  }

  // Abort hanging requests (bad Wi-Fi, server down) instead of spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/api/jarvis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    let data: JarvisResponse | JarvisError;
    try {
      data = (await res.json()) as JarvisResponse | JarvisError;
    } catch {
      throw new Error(`Server returned an invalid response (HTTP ${res.status}).`);
    }

    if (!res.ok || "error" in data) {
      throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("JARVIS took too long to answer.");
    if (err instanceof TypeError) throw new Error(`Cannot reach server at ${API_URL}. Same Wi-Fi?`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
