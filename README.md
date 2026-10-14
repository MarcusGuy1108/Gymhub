# GymHub

An iPhone workout log you can just talk to.

Type or dictate what you're doing between sets — *"bench 80kg x 8"*, *"currently at 5 minutes pushing 10% inc at 5k"* — and GymHub fills in your log and tells you what to go for next. Like Hevy, but with more focus on cardio and a coach that understands normal gym chat.

## Features

- **Coach chat.** Messages turn into log entries: sets, reps and weights; treadmill speed, incline and time; bike levels; rowing distance. Each reply suggests a next step from your history: beat last week's set, bump the incline at the next 5-minute mark, rest time.
- **Live cardio.** Send a status update mid-treadmill and it builds a timeline (0–10 min at 10% / 5 km/h, then 12%…), with estimated distance and calories. Quick-reply chips (*Incline 13%*, *Speed 5.5*, *Done*) let you update with one tap.
- **Workout tab.** A Hevy-style manual logger with exercise cards, an add-set row, cardio cards with live update and finish controls, and a session timer.
- **History and progress.** Every session, plus per-exercise history with best estimated 1RM, heaviest set and a progress chart.
- **Works offline.** Without an API key or a signal, a built-in parser handles the common phrasings. With a key, Claude handles everything else ("did 3 rounds of 10 min at 5k then 2 min at 6.5k").
- **Hands-free.** Tap the 🎤 on the iOS keyboard to talk, and turn on *Read replies aloud* in Settings.
- kg or lb, km or miles, light and dark mode. Data stays on your phone and can be exported as JSON.

## Run it on your iPhone (no Mac needed)

1. Install [Node.js](https://nodejs.org) 20 or newer on any computer (Windows, Mac or Linux).
2. Get the code and start it:
   ```bash
   git clone https://github.com/MarcusGuy1108/Gymhub.git
   cd Gymhub
   npm install
   npx expo start
   ```
3. Install **Expo Go** from the App Store, then scan the QR code in the terminal with the iPhone camera. Your phone and computer need to be on the same Wi-Fi. If they can't be, use `npx expo start --tunnel`.

## Install as a standalone app (.ipa)

GitHub Actions builds an unsigned `GymHub.ipa` on a Mac runner, so you don't need a Mac yourself. Download it from the [latest release](https://github.com/MarcusGuy1108/Gymhub/releases/latest), or directly from <https://github.com/MarcusGuy1108/Gymhub/releases/latest/download/GymHub.ipa>.

Sign it with your developer certificate and provisioning profile before installing, using Sideloadly, ESign or Feather. The bundle ID is `com.gymhub.app`, and your signer can change it to match your profile.

A new build runs whenever app code changes on `main`, takes about 15–20 minutes, and becomes the latest release. You can also start one from **Actions → iOS .ipa → Run workflow**. The workflow is in `.github/workflows/ios-ipa.yml`.

For TestFlight or the App Store, use [EAS Build](https://docs.expo.dev/build/introduction/) instead.

## Turn on the AI coach

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/settings/keys). Usage is billed to your Anthropic account.
2. In the app, open **Settings → Anthropic API key**, paste it and tap **Save**.
3. Choose a model. **Opus 5.5** is the default and the smartest; **Sonnet 5.5** and **Haiku 5.5** are faster and cheaper.

The key is stored in the iOS Keychain and sent only to Anthropic's API, directly from your phone. This is fine for a personal app. If you ever publish the app for other people, put a small server between the app and the API so the key never ships inside the app.

## Things you can say

| You say | It logs |
|---|---|
| `Starting push day` | New session called "Push day" |
| `bench 80kg x 8` / `80 for 8` / `80kg 8, 8, 6` | Bench Press sets |
| `3x10 squats at 60` | 3 sets of 10 at 60 kg |
| `same again` / `one more set of 6` | Repeats the last set |
| `currently at 5 minutes pushing 10% inc at 5k` | Treadmill: 0–5 min at 5 km/h, 10% incline |
| `now at 12 minutes, upped it to 12%` | Closes that stretch and starts a new one at 12% |
| `done, 30 mins total, 2.6km` | Finishes the treadmill |
| `did 20 min on the bike at level 8` | A completed bike session |
| `ran 5k in 25 minutes` | A 5 km run |
| `scratch that` | Undoes the last log |
| `that's it for today` | Finishes the workout with a summary |

On a treadmill, *"at 5k"* means a speed of 5 km/h. *"Ran 5k"* means a distance.

## How it's built

[Expo](https://expo.dev) SDK 57 with React Native and TypeScript, and expo-router for navigation (native iOS tabs).

```
src/
  app/            Screens: (coach)/ chat, workout/, history/, settings/
  coach/          Claude tool-use loop, system prompt, offline fallback, per-turn context
  lib/            Pure logic with no React: data model, logging rules, phrase parser, stats, suggestions
  store/          Zustand store persisted to AsyncStorage; API key in SecureStore
  components/     UI building blocks: chat bubbles, entry cards, pickers, chart
```

- Each coach message goes to Claude with tools (`log_strength_sets`, `cardio_update`, `log_cardio`, `start_session`, `finish_session`, `undo_last_log`, `get_history`). Tool calls write straight to the log. A snapshot of the current session and recent history rides along with every message.
- Claude and the offline parser produce the same `CoachAction`s, and `src/lib/workout.ts` applies them, so both paths log identically.
- `metro.config.js` points Metro at the Anthropic SDK's CommonJS build, because its ES-module build has circular imports that Metro can't initialise.

## Development

```bash
npm test            # parser, logging rules and Claude tool-loop tests
npm run typecheck
npm run lint
npx expo start      # press w for the web preview
```

## Ideas for next

- A push-to-talk button in the app with `expo-speech-recognition`. It needs a development build, not Expo Go.
- Apple Health and Apple Watch heart rate.
- A rest timer with a notification.
- Routines and templates.
- Import from Hevy's CSV export.
- iCloud backup.
