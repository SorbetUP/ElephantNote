# ElephantNote Android

Minimal native Android companion for offline capture.

Implemented:

- local offline note storage through private `SharedPreferences`
- Google Keep-style quick capture screen
- Android share sheet receiver for `text/*`
- no network requirement

Build prerequisite: Android SDK with platform 35 and Gradle/Android Gradle Plugin available.

```bash
./gradlew -p android assembleDebug
```
