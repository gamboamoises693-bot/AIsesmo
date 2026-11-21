// Long-term memory persisted on the device with AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const MEMORY_KEY = "jarvis.memories.v1";
const MAX_MEMORIES = 50;

export function useMemories() {
  const [memories, setMemories] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(MEMORY_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setMemories(parsed.filter((m): m is string => typeof m === "string"));
      })
      .catch(() => {
        /* corrupted or unavailable storage: start with empty memory */
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: string[]) => {
    AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(next)).catch(() => {
      /* write failed: memory still works for this session */
    });
  }, []);

  const addMemories = useCallback(
    (facts: string[]) => {
      if (!facts.length) return;
      setMemories((prev) => {
        const next = [...new Set([...prev, ...facts])].slice(-MAX_MEMORIES);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearMemories = useCallback(() => {
    setMemories([]);
    persist([]);
  }, [persist]);

  return { memories, loaded, addMemories, clearMemories };
}
