# AIsesmo: J.A.R.V.I.S voice assistant

Voice assistant with a sci-fi HUD, powered by Claude (Anthropic API).

- `/` (repo root): Next.js 16 + TypeScript + Tailwind web app **and** the `/api/jarvis` backend
- `mobile/`: Expo / React Native app that talks to the same backend

## Features
- Voice in (Web Speech API / native speech recognition) and voice out (TTS)
- Tools: current time, live weather (Open-Meteo), web search, memory
- Long-term memory stored on the device

## Deploy (Vercel)
1. Import this repo on vercel.com (framework: Next.js, root directory: `./`)
2. Add environment variable `ANTHROPIC_API_KEY`
3. Deploy, then open the URL in Chrome and "Add to Home screen"

## Local dev
```bash
npm install
cp .env.example .env.local   # put your ANTHROPIC_API_KEY
npm run dev
```

> Security: `/api/jarvis` has no auth or rate limit yet. Anyone with the URL can use your API credits.
