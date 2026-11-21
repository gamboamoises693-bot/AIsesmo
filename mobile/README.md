# JARVIS Mobile (Expo / React Native)

Voice assistant HUD. The brain is the Next.js backend at the repo root (keeps the Anthropic key off the phone).

## Run
1. Backend: `npm install && echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local && npm run dev:lan`
2. Mobile: `cp .env.example .env` and set `EXPO_PUBLIC_JARVIS_API_URL` to your PC's LAN IP (e.g. http://192.168.1.10:3000)
3. `npm install && npx expo run:android` (needs Android Studio / a USB phone). Expo Go will NOT work: speech recognition is a native module.

## Build an APK
`npx eas build -p android --profile preview` (needs an Expo account), or `cd android && ./gradlew assembleRelease` after `npx expo prebuild`.
