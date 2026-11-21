// Shared types between the API route and the HUD client.

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

export type JarvisRequest = {
  /** Previous turns (text only) so JARVIS keeps short-term context. */
  history: ChatTurn[];
  /** Long-term memory facts stored on the client (localStorage). */
  memories: string[];
  /** The new user utterance (from voice or keyboard). */
  message: string;
};

export type JarvisResponse = {
  reply: string;
  /** Names of tools JARVIS used this turn, shown in the HUD "Tools" log. */
  toolsUsed: string[];
  /** Facts JARVIS decided to remember this turn. */
  newMemories: string[];
};

export type JarvisError = { error: string };
