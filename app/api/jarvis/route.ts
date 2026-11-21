// JARVIS brain: Claude + tools (time, weather, memory, web search).
// Runs server-side only, so the API key never reaches the browser.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { JarvisError, JarvisRequest, JarvisResponse } from "@/lib/types";

export const runtime = "nodejs";
// Tool loops (weather + web search) can take a while; allow up to 60s on Vercel.
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const MAX_HISTORY_TURNS = 20;
const MAX_MESSAGE_CHARS = 2000;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are J.A.R.V.I.S, a calm, witty personal assistant.
Your replies are spoken aloud by text-to-speech, so:
- Keep answers to 1-3 short sentences unless asked for detail.
- No markdown, bullet points, emojis, or URLs.
- Reply in the same language the user uses (English, Tagalog, or Taglish).
When the user tells you a lasting personal fact or preference, call save_memory.
Use get_weather for weather, get_time for date/time, and web_search for current events.`;

/** Geocode a city name, then fetch current weather from Open-Meteo (free, no API key). */
async function fetchWeather(city: string): Promise<string> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
  );
  if (!geoRes.ok) throw new Error(`Geocoding failed (${geoRes.status})`);
  const geo = (await geoRes.json()) as {
    results?: { name: string; country: string; latitude: number; longitude: number }[];
  };
  const place = geo.results?.[0];
  if (!place) return `No location found for "${city}".`;

  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`,
  );
  if (!wxRes.ok) throw new Error(`Weather API failed (${wxRes.status})`);
  const wx = (await wxRes.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      weather_code: number;
    };
  };
  const c = wx.current;
  return JSON.stringify({
    location: `${place.name}, ${place.country}`,
    temperature_c: c.temperature_2m,
    humidity_pct: c.relative_humidity_2m,
    wind_kmh: c.wind_speed_10m,
    wmo_weather_code: c.weather_code,
  });
}

/** Typed wrapper so every response body matches the shared contract. */
function json<T extends JarvisResponse | JarvisError>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** Basic runtime validation of the request body (never trust the client). */
function parseBody(raw: unknown): JarvisRequest | null {
  const schema = z.object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) }))
      .max(200)
      .default([]),
    memories: z.array(z.string().max(500)).max(100).default([]),
  });
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

export async function POST(req: Request): Promise<Response> {
  let body: JarvisRequest | null;
  try {
    body = parseBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) {
    return json<JarvisError>({ error: "Invalid request body." }, { status: 400 });
  }

  // Per-request state collected by the tools.
  const toolsUsed: string[] = [];
  const newMemories: string[] = [];

  const getTime = betaZodTool({
    name: "get_time",
    description: "Get the current date and time in an IANA timezone.",
    inputSchema: z.object({
      timezone: z.string().describe("IANA timezone, e.g. Asia/Manila").default("Asia/Manila"),
    }),
    run: async ({ timezone }) => {
      toolsUsed.push("get_time");
      try {
        return new Date().toLocaleString("en-PH", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
      } catch {
        return `Unknown timezone "${timezone}".`;
      }
    },
  });

  const getWeather = betaZodTool({
    name: "get_weather",
    description: "Get the current weather for a city.",
    inputSchema: z.object({ city: z.string().describe("City name, e.g. Manila") }),
    run: async ({ city }) => {
      toolsUsed.push("get_weather");
      try {
        return await fetchWeather(city);
      } catch (err) {
        return `Weather lookup failed: ${(err as Error).message}`;
      }
    },
  });

  const saveMemory = betaZodTool({
    name: "save_memory",
    description: "Store a lasting fact about the user (name, preferences, projects).",
    inputSchema: z.object({ fact: z.string().min(3).max(300).describe("One short fact in third person") }),
    run: async ({ fact }) => {
      toolsUsed.push("save_memory");
      newMemories.push(fact);
      return "Saved.";
    },
  });

  // Long-term memory goes in a mid-turn-stable spot: the system prompt keeps
  // the static part first (cache-friendly), memories after it.
  const memoryBlock = body.memories.length
    ? `Known facts about the user:\n- ${body.memories.join("\n- ")}`
    : "No saved facts about the user yet.";

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...body.history.slice(-MAX_HISTORY_TURNS).map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: body.message },
  ];

  try {
    const finalMessage = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "low" }, // fast replies for voice chat
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: memoryBlock },
      ],
      tools: [getTime, getWeather, saveMemory, { type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages,
      max_iterations: 6,
    });

    if (finalMessage.stop_reason === "refusal") {
      return json<JarvisResponse>({
        reply: "Sorry, I can't help with that one.",
        toolsUsed,
        newMemories,
      });
    }

    for (const block of finalMessage.content) {
      if (block.type === "server_tool_use") toolsUsed.push(block.name);
    }

    const reply = finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    return json<JarvisResponse>({
      reply: reply || "Done.",
      toolsUsed: [...new Set(toolsUsed)],
      newMemories,
    });
  } catch (err) {
    // Most-specific first: map SDK errors to friendly HTTP responses.
    if (err instanceof Anthropic.AuthenticationError) {
      return json<JarvisError>({ error: "Invalid ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json<JarvisError>({ error: "Rate limited. Try again in a moment." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return json<JarvisError>({ error: "Cannot reach the AI service." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      return json<JarvisError>({ error: `AI error: ${err.message}` }, { status: 502 });
    }
    console.error("[jarvis] unexpected error", err);
    return json<JarvisError>({ error: "Unexpected server error." }, { status: 500 });
  }
}
