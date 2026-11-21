// Same contract as the Next.js backend (keep in sync with jarvis/lib/types.ts).

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type JarvisResponse = {
  reply: string;
  toolsUsed: string[];
  newMemories: string[];
};

export type JarvisError = { error: string };
