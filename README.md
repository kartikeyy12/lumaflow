# LumaFlow

**Find your rhythm. Stay in the flow.**

A minimal, ambient study timer for focused work, deliberate breaks and consistent study habits. It runs entirely in your browser: no account, no server, no network calls.

![LumaFlow focus session](docs/screenshots/focus.png)

## Features

- **Focus, short break and long break** timers. Defaults are 25 / 5 / 15 minutes, and every length is configurable (1 to 180 minutes for focus).
- **Reliable timing.** The countdown is computed from an absolute end timestamp, never from counting interval ticks, so it stays correct through background tabs, throttling, laptop sleep and reloads.
- **Stopwatch.** For open-ended work with no target. It counts up, pauses and resumes, and saves a history entry when you finish. Runs under a minute are not saved. If the device sleeps or the tab is closed while it runs, it pauses at the last moment the app was alive, so time away is never counted as study time.
- **Six backgrounds**, chosen in Settings or cycled with `B`: Ribbon (the original), Nebula (a colourful starfield), Aurora, Ripples, Drift (warm dust in lamplight) and Still (no motion). Each one slows to a stop when you pause, and none of them speeds up or brightens as time runs out.
- **Brown noise**, off by default and never on after a reload. Toggle it with the speaker button or `M`. It is generated in the browser, so there is no audio file to load.
- **Session tracking.** Completed sessions and total focus time for today, plus an optional daily goal shown as a quiet progress bar.
- **Session notes.** Write what you are studying before you start, and add an optional "review next" note when a session ends.
- **History.** Date, time, duration, topic and whether each session finished or ended early. Delete single entries or clear everything (with confirmation).
- **Optional extras, all off by default:** soft chime, browser notification, automatic phase transitions (capped at 4 in a row, so it never loops unattended).
- **Keyboard first**, with a built-in shortcut list (`?`).
- **Accessible:** semantic HTML, labelled controls, visible focus rings, status shown with text and icons rather than colour alone, screen reader announcements for state changes, and full `prefers-reduced-motion` support.
- **Works offline** once loaded. The font is bundled.

| Nebula | Aurora |
| --- | --- |
| ![Nebula background](docs/screenshots/bg-nebula.png) | ![Aurora background](docs/screenshots/bg-aurora.png) |

| Ripples | Drift |
| --- | --- |
| ![Ripples background](docs/screenshots/bg-ripples.png) | ![Drift background](docs/screenshots/bg-drift.png) |

| Stopwatch | Session complete |
| --- | --- |
| ![Stopwatch](docs/screenshots/stopwatch.png) | ![Complete](docs/screenshots/complete.png) |

| History | Settings |
| --- | --- |
| ![History](docs/screenshots/history.png) | ![Settings](docs/screenshots/settings.png) |

On a phone:

<img src="docs/screenshots/mobile.png" width="220" alt="Mobile layout">

## Tech stack

React 19, TypeScript, Vite, plain CSS, Canvas 2D for the backgrounds, WebAudio for the chime and brown noise. Geist font via `@fontsource-variable/geist` (bundled, no CDN). Tests use Vitest and Playwright.

## Prerequisites

- Node.js 22.12 or newer (required by Vitest 5; the app itself builds on Node 20.19+)
- npm

## Install and run

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | TypeScript check only |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, builds and serves the production bundle) |

For the browser tests, install a browser once with `npx playwright install chromium`. To use a Chromium you already have, set `LUMAFLOW_CHROMIUM` to its path.

To use the built app, serve `dist/` with any static file server (`npm run preview` is the easiest). Opening `index.html` straight from disk will not work because the app uses ES modules.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Start, pause or resume |
| `R` | Reset, or finish the stopwatch (press twice when a run is under way) |
| `1` / `2` / `3` | Focus / short break / long break |
| `4` | Stopwatch |
| `B` | Next background |
| `M` | Brown noise on or off |
| `F` | Toggle full screen |
| `?` | Show the shortcut list |
| `Esc` | Cancel a pending reset, or close a panel |

Shortcuts are ignored while you type in a field or while a dialog is open. When a button has focus, `Space` presses that button instead.

## How the timer works

- A running phase stores `targetAt` (epoch milliseconds). Remaining time is always `targetAt - now`. A pause stores the remainder, and resume sets a new `targetAt`.
- The state is saved to `localStorage` every few seconds and on every action. After a reload, the app recomputes everything from the saved timestamps.
- If a phase ended while the app was closed or the device asleep, it is marked complete **silently**: no sound, no notification, no automatic next phase, and a short message explains what happened. The session is logged at its real end time.
- Each phase has a unique id, and the log refuses duplicate ids, so a session can only be recorded once however many times the page reloads or ticks.
- **Ending a focus session early** (reset or switching mode after at least 1 minute of progress) logs the time spent as "ended early". Early sessions add to today's focused time but are not counted as completed sessions. Under a minute is not logged.
- **Daily totals** use your local calendar day. A session belongs to the day on which it ended.
- **The stopwatch** stores when it started and how much it had already counted, so its reading also comes from the clock. A gap longer than 2.5 minutes between heartbeats counts as sleep or a closed tab: the stopwatch pauses at the last heartbeat and says so. Finishing saves one entry, marked as a stopwatch run, and adds to today's focused time.
- **Only one thing runs at a time.** Starting the stopwatch ends a running focus session early (logging the time so far), and leaving a running stopwatch saves it first. Both ask for a second key press when real progress would be saved.

## Data and privacy

Everything stays in your browser's `localStorage` under keys starting with `lumaflow.v1.`: settings (including your background and noise volume), the current timer and stopwatch state, and up to 1000 history entries. Nothing is sent anywhere. Clear it from the History panel, or by clearing site data in your browser. If `localStorage` is unavailable (some private modes), the app still works for the current page but cannot remember anything.

## Known limitations

- **One tab at a time.** Two tabs can both fire a chime or notification for the same session. The history still records it once.
- **Fully backgrounded tabs.** Browsers can throttle timers to about once a minute. The recorded time is exact, but the chime or notification may arrive up to roughly a minute late.
- **Chime needs a gesture.** Browsers block audio until you interact with the page. Starting the timer counts, so this only matters if you enable sound mid-session and never touch the page.
- **Notifications** need explicit permission and a secure context (`localhost` or HTTPS).
- **Brown noise** has not been listened to on the machine it was built on. The browser tests only check that it toggles and that it is never on after a reload. Set the volume to taste in Settings.
- **Backgrounds on slow hardware.** The animated ones are capped at 30 frames per second and stop completely when the tab is hidden or the timer is paused. If your machine struggles, pick Still.
- **No cross-device sync.** By design.
- Automated tests run in Chromium only. Firefox and Safari should work but are unverified.

LumaFlow is a focus aid. It is not a substitute for active recall, practice questions, spaced repetition or sleep, and it makes no claims about improving memory or marks.

## Project structure

```
src/
  core/        Pure logic, no React: timer.ts (state transitions), stats.ts, storage.ts,
               format.ts, controller.ts (persistence, ticking, events), plus unit tests
               stopwatch.ts (count-up state, away handling)
  flow/        Background engine: flow.ts (ribbon maths), scene.ts (shared interface),
               scenes/ (ribbon, nebula, aurora, ripples, drift, still)
  components/  TimerDial, ModeTabs, Controls, StatsDock, dialogs, FlowCanvas
  hooks/       useTimer, useShortcuts, useReducedMotion
  feedback/    chime.ts, noise.ts (WebAudio), notify.ts (Notifications API)
  styles.css
e2e/           Playwright browser tests
docs/screenshots/
```

## License

MIT. See [LICENSE](LICENSE). The Geist font is bundled under its own SIL Open Font License via `@fontsource-variable/geist`.
