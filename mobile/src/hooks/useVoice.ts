// Voice I/O: native speech-to-text (expo-speech-recognition) + text-to-speech (expo-speech).
// NOTE: expo-speech-recognition is a native module, so it needs a development build
// (`npx expo run:android`), NOT Expo Go.

import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";

// Errors that just mean "user said nothing / cancelled"; don't show them.
const SILENT_ERRORS = new Set(["no-speech", "aborted", "speech-timeout"]);

export function useVoice(onFinalTranscript: (text: string) => void, lang = "en-US") {
  const [available, setAvailable] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  useEffect(() => {
    try {
      setAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setAvailable(false); // module missing (e.g. running in Expo Go)
    }
    return () => {
      Speech.stop();
    };
  }, []);

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setInterim("");
  });
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      setInterim("");
      if (transcript.trim()) callbackRef.current(transcript.trim());
    } else {
      setInterim(transcript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (!SILENT_ERRORS.has(event.error)) setError(`Mic error: ${event.message || event.error}`);
  });

  const listen = useCallback(async () => {
    setError(null);
    Speech.stop(); // interrupt JARVIS if it is talking
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone permission denied. Enable it in Settings.");
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false, // one command per tap
        addsPunctuation: true,
      });
    } catch (err) {
      setError(`Cannot start mic: ${(err as Error).message}`);
    }
  }, [lang]);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      Speech.stop();
      Speech.speak(text, {
        language: lang,
        rate: 1.0,
        pitch: 0.9,
        onStart: () => setSpeaking(true),
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [lang],
  );

  return { available, listening, speaking, interim, error, listen, stopListening, speak };
}
