import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Bars, Core, Panel, StatusBadge, type Status } from "./src/components/Hud";
import { useMemories } from "./src/hooks/useMemories";
import { useVoice } from "./src/hooks/useVoice";
import { askJarvis } from "./src/lib/api";
import { colors } from "./src/lib/theme";
import type { ChatTurn } from "./src/lib/types";

const WAVE = Array.from({ length: 21 }, (_, i) => 30 + ((i * 37) % 70));
const MAX_HISTORY = 20;

function JarvisScreen() {
  const { width } = useWindowDimensions();
  const coreSize = Math.min(width - 48, 340);

  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [lastToolsCount, setLastToolsCount] = useState(0);
  const [caption, setCaption] = useState("Tap the core or type to talk.");
  const [apiError, setApiError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const busy = useRef(false);

  const { memories, addMemories, clearMemories } = useMemories();

  // Latest state for the voice callback (avoids stale closures).
  const stateRef = useRef({ history, memories });
  stateRef.current = { history, memories };
  const speakRef = useRef<(t: string) => void>(() => {});

  const ask = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (busy.current || !message) return;
      busy.current = true;
      setThinking(true);
      setApiError(null);
      setCaption(`“${message}”`);

      try {
        const data = await askJarvis({
          message,
          history: stateRef.current.history.slice(-MAX_HISTORY),
          memories: stateRef.current.memories,
        });
        setHistory((h) => [...h, { role: "user", text: message }, { role: "assistant", text: data.reply }]);
        setLastToolsCount(data.toolsUsed.length);
        addMemories(data.newMemories);
        setCaption(data.reply);
        speakRef.current(data.reply);
      } catch (err) {
        const msg = (err as Error).message || "Something went wrong.";
        setApiError(msg);
        setCaption(msg);
      } finally {
        busy.current = false;
        setThinking(false);
      }
    },
    [addMemories],
  );

  const voice = useVoice(ask, "en-US");
  speakRef.current = voice.speak;

  const status: Status =
    apiError || voice.error
      ? "ERROR"
      : voice.listening
        ? "LISTENING"
        : thinking
          ? "THINKING"
          : voice.speaking
            ? "SPEAKING"
            : "ONLINE";
  const active = status === "LISTENING" || status === "THINKING" || status === "SPEAKING";

  const onCorePress = () => {
    if (!voice.available) {
      Alert.alert("Voice unavailable", "Speech recognition is not available. Use a development build, or type instead.");
      return;
    }
    if (voice.listening) voice.stopListening();
    else void voice.listen();
  };

  const onSend = () => {
    const text = input;
    setInput("");
    void ask(text);
  };

  const onForget = () =>
    Alert.alert("Forget everything?", "This deletes all memories saved on this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Forget", style: "destructive", onPress: clearMemories },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>☰ Assistant</Text>
          <StatusBadge status={status} />
        </View>

        {/* System panels */}
        <View style={styles.panels}>
          <Panel icon="🎙" title="Voice" active={voice.listening || voice.speaking} />
          <Panel icon="⫶" title="Memory" active={thinking} badge={memories.length} />
          <Panel icon="🌐" title="Tools" active={thinking || lastToolsCount > 0} badge={lastToolsCount} />
        </View>

        {/* Arc reactor core = big mic button */}
        <View style={[styles.flex, styles.center]}>
          <Pressable
            onPress={onCorePress}
            accessibilityRole="button"
            accessibilityLabel={voice.listening ? "Stop listening" : "Start listening"}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <Core size={coreSize} active={active}>
              <Text style={styles.logo}>J.A.R.V.I.S</Text>
              <View style={{ marginTop: 12 }}>
                <Bars heights={WAVE} active={active} barWidth={3} height={24} />
              </View>
              {thinking && <ActivityIndicator color={colors.hud} style={{ marginTop: 12 }} />}
            </Core>
          </Pressable>
        </View>

        {/* Caption */}
        <Text style={styles.caption} accessibilityLiveRegion="polite" numberOfLines={4}>
          {voice.interim || voice.error || caption}
        </Text>

        {/* Keyboard fallback */}
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a command…"
            placeholderTextColor="rgba(79,209,255,0.4)"
            style={styles.input}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={onSend}
            editable={!thinking}
          />
          <Pressable
            onPress={onSend}
            disabled={thinking || !input.trim()}
            style={({ pressed }) => [styles.sendBtn, (thinking || !input.trim()) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{memories.length} memories on this phone</Text>
          <Pressable onPress={onForget} hitSlop={8}>
            <Text style={[styles.footerText, { textDecorationLine: "underline" }]}>Forget all</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <JarvisScreen />
    </SafeAreaProvider>
  );
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    color: colors.hud,
    fontFamily: mono,
    fontWeight: "700",
    fontSize: 22,
    letterSpacing: 3,
    textShadowColor: colors.hud,
    textShadowRadius: 10,
  },
  panels: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 16 },
  logo: {
    color: "#fff",
    fontFamily: mono,
    fontWeight: "800",
    fontSize: 24,
    letterSpacing: 3,
    textShadowColor: colors.hud,
    textShadowRadius: 12,
  },
  caption: {
    color: "#fff",
    fontFamily: mono,
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 16,
    minHeight: 48,
    textShadowColor: colors.hud,
    textShadowRadius: 8,
  },
  inputRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hudDim,
    borderRadius: 6,
    color: colors.text,
    fontFamily: mono,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    borderWidth: 1,
    borderColor: colors.hud,
    borderRadius: 6,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendText: { color: colors.hud, fontFamily: mono },
  footer: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  footerText: { color: "rgba(79,209,255,0.6)", fontSize: 11, fontFamily: mono },
});
