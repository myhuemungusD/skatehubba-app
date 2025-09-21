# SkateHubba

Next.js + Firebase app with challenges flow.

## Environment configuration

Firebase is configured exclusively through environment variables loaded from `.env.local`. Create the file at the project root and add the keys generated for your Firebase project:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
# Optional for Analytics
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

The app validates these values at runtime and will throw an explicit error if any required key is missing or empty. Keep production credentials out of source control—`.env.local` is gitignored by default.

## Getting started

1. Install dependencies with `npm install`.
2. Run the development server with `npm run dev`.
3. Sign in and exercise the challenge flows backed by your Firebase project.

Refer to the Firebase console for the exact values to use and rotate credentials if they are ever exposed.
