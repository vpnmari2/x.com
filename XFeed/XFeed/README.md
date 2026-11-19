# XFeed

A tiny Android app that opens **x.com** in a WebView and adds:

| Feature | How it behaves |
|---|---|
| **Auto-align** | When you stop scrolling, the nearest post glides to the top of the screen. |
| **Long posts** | A post taller than the screen is *not* snapped while you're reading inside it – scroll freely. Snapping resumes once you reach its end. |
| **Auto-play** | Videos play when ~60% visible and pause when they scroll away. A video you pause yourself stays paused until it leaves the screen. |
| **Double-tap to like** | Double-tap a post's text, photo or video: heart animation + haptic tick + the like button is pressed. Double-tapping an already-liked post does nothing (never un-likes). |

All of the above lives in `app/src/main/assets/inject.js` – the `CFG` block at the top has the knobs
(`snapDelay`, `topOffset`, `autoplayThreshold`, `doubleTapMs`, ...).

## Get the APK

### Option A – GitHub Actions (no Android Studio needed)
1. Create a new GitHub repo and push this folder to it (`main` branch).
2. Open the repo's **Actions** tab → *Build APK* → wait for it to finish.
3. Download the **XFeed-apk** artifact (zip) and unzip it – inside is `app-debug.apk`.

### Option B – Android Studio
1. *File ▸ Open* this folder and let Gradle sync.
2. *Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)*.
3. APK is in `app/build/outputs/apk/debug/`.

### Option C – command line
Needs JDK 17 and the Android SDK (`ANDROID_HOME` set, platform 35 installed).
```
gradle wrapper --gradle-version 8.9   # once, creates ./gradlew
./gradlew assembleDebug
```

## Install
Copy the APK to your phone, open it, and allow "install unknown apps" for your file manager/browser when asked.

## Notes
- **Login:** use X username/email + password inside the app. "Sign in with Google" is blocked by Google inside WebViews.
- **Links to other sites** (and `t.co` short links) open in your normal browser.
- **Single taps on posts** are delayed by `doubleTapMs` (280 ms) so the app can tell a double tap from a single one.
  Lower the value for snappier single taps.
- X changes its markup now and then. If snapping or double-tap stops working, check the `ARTICLE` selector and the
  `data-testid` names (`like`, `unlike`) at the top of `inject.js`. If posts end up hidden under X's top bar,
  set `topOffset` to a fixed number such as `56`.
- This is an unofficial client that wraps the public website; it is for personal use.
