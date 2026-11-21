// HUD building blocks: arc-reactor core, equalizer bars, side panels, status badge.
// Uses React Native's Animated API with the native driver (smooth even when JS is busy).

import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../lib/theme";

/** Infinite rotation; `fast` speeds it up while JARVIS is active. */
function useSpin(durationMs: number, reverse = false) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(value, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: true }),
    );
    value.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [durationMs, value]);
  return value.interpolate({ inputRange: [0, 1], outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"] });
}

function Ring({ size, r, width, dash, opacity, spin }: {
  size: number; r: number; width: number; dash: string; opacity: number; spin: Animated.AnimatedInterpolation<string>;
}) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin }] }]}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={r} fill="none" stroke={colors.hud} strokeWidth={width} strokeDasharray={dash} opacity={opacity} />
      </Svg>
    </Animated.View>
  );
}

export function Core({ size, active, children }: { size: number; active: boolean; children?: React.ReactNode }) {
  const outer = useSpin(active ? 4000 : 24000);
  const middle = useSpin(16000, true);
  const inner = useSpin(active ? 5000 : 20000);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="coreFill" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.hud} stopOpacity={active ? 0.35 : 0.15} />
            <Stop offset="100%" stopColor={colors.hud} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={100} cy={100} r={70} fill="url(#coreFill)" />
        <Circle cx={100} cy={100} r={58} fill="none" stroke={colors.hud} strokeWidth={0.6} opacity={0.4} />
      </Svg>
      <Ring size={size} r={94} width={3} dash="40 18" opacity={0.8} spin={outer} />
      <Ring size={size} r={82} width={1.5} dash="6 6" opacity={0.6} spin={middle} />
      <Ring size={size} r={70} width={2} dash="90 30 10 30" opacity={0.9} spin={inner} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

/** Row of equalizer bars that bounce while `active`. */
export function Bars({ heights, active, barWidth, height, gap = 3 }: {
  heights: number[]; active: boolean; barWidth?: number; height: number; gap?: number;
}) {
  const anims = useMemo(() => heights.map(() => new Animated.Value(1)), [heights]);

  useEffect(() => {
    if (!active) {
      anims.forEach((a) => a.setValue(1));
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i % 7) * 90),
          Animated.timing(a, { toValue: 0.3, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(a, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, anims]);

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap }}>
      {heights.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            flex: barWidth ? undefined : 1,
            width: barWidth,
            height: (h / 100) * height,
            borderRadius: 2,
            backgroundColor: colors.hud,
            opacity: active ? 1 : 0.75,
            // scaleY around the bottom edge: shift by half the height
            transform: [
              { translateY: (h / 100) * height * 0.5 },
              { scaleY: anims[i] },
              { translateY: -(h / 100) * height * 0.5 },
            ],
          }}
        />
      ))}
    </View>
  );
}

const PANEL_BARS = [70, 45, 20, 40, 95, 90];

export function Panel({ icon, title, active, badge }: { icon: string; title: string; active: boolean; badge?: number }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle} numberOfLines={1}>
          {icon} {title}
        </Text>
        {badge !== undefined && <Text style={styles.badgeCount}>{badge}</Text>}
      </View>
      <Bars heights={PANEL_BARS} active={active} height={40} />
    </View>
  );
}

export type Status = "ONLINE" | "LISTENING" | "THINKING" | "SPEAKING" | "ERROR";

export function StatusBadge({ status }: { status: Status }) {
  const color = status === "ERROR" ? colors.error : colors.ok;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "ONLINE") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  return (
    <View style={[styles.statusBadge, { borderColor: color }]} accessibilityRole="text" accessibilityLabel={`Status ${status}`}>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse }]} />
      <Text style={[styles.statusText, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hudDim,
    backgroundColor: "rgba(79,209,255,0.05)",
    padding: 8,
    gap: 8,
    shadowColor: colors.hud,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { color: colors.text, fontWeight: "700", fontSize: 13, flexShrink: 1 },
  badgeCount: { color: colors.hud, fontSize: 11 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontWeight: "800", letterSpacing: 2, fontSize: 13 },
});
