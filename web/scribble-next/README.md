# Scribble-style Game (Next.js + Firebase Realtime Database)

This app is a lightweight `scribble.io`-style multiplayer drawing game built with **Next.js App Router** and **Firebase Realtime Database**.

## Features

- Multiplayer room join by room id
- Realtime shared canvas drawing (drawer only)
- Player list + scoring
- Chat/guess stream
- Round progression with rotating drawer

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local`:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

3. Run the app:

   ```bash
   npm run dev
   ```

Open <http://localhost:3000>.

## Firebase notes

- Enable **Realtime Database** in Firebase console.
- For quick local testing only, use relaxed rules (do not use in production):

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Then harden security rules before production release.
