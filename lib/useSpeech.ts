"use client";

// Browser speech: Web Speech API for listening (STT) and speechSynthesis for talking (TTS).
// Works best in Chrome/Edge (desktop + Android). Safari support is partial.

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings: SpeechRecognition is not in TypeScript's lib.dom yet.
type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(onFinalTranscript: (text: string) => void, lang = "en-US") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    setSupported(Boolean(Ctor));
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false; // one utterance per mic press

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) callbackRef.current(finalText.trim());
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are normal; don't scare the user.
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Mic error: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;

    return () => {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.stop(); } catch { /* already stopped */ }
    };
  }, [lang]);

  const listen = useCallback(() => {
    if (!recRef.current) return;
    window.speechSynthesis?.cancel(); // interrupt JARVIS if talking
    setError(null);
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      // start() throws if already running; ignore.
    }
  }, []);

  const stopListening = useCallback(() => recRef.current?.stop(), []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Prefer an English male-ish voice if available; falls back to default.
    const voices = window.speechSynthesis.getVoices();
    utter.voice =
      voices.find((v) => /Google UK English Male|Daniel|Microsoft Guy/i.test(v.name)) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null;
    utter.rate = 1.02;
    utter.pitch = 0.9;
    utter.onstart = () => setSpeaking(true);
    utter.onend = utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, []);

  return { supported, listening, speaking, interim, error, listen, stopListening, speak };
}
