# Backend setup

The backend is a Hono app (`server/`) exposed at `/api/*`, with Better Auth
for sessions and Drizzle over Supabase Postgres (see
[ADR 0001](adr/0001-backend-stack.md)).

## Run locally

```bash
supabase start            # local Postgres + Studio (ports 553xx — Docker/OrbStack required)
npm run db:migrate        # apply drizzle/ migrations
npm run api               # Hono API on http://localhost:8787/api

EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo start --web
```

No `.env` is needed for local dev — `server/env.ts` falls back to the local
Supabase DB URL and a dev-only auth secret. Without `EXPO_PUBLIC_API_URL` the
app runs in **offline demo mode** (mock auth, seeded data), exactly as before.
On a physical device, point `EXPO_PUBLIC_API_URL` at your machine's LAN IP.

Useful: Supabase Studio at http://127.0.0.1:55323, `supabase stop` when done.

## Schema changes

```bash
# after editing server/db/schema.ts:
npm run db:generate       # writes a migration into drizzle/
npm run db:migrate        # applies it

# after changing Better Auth config (plugins, additionalFields):
npm run auth:schema       # regenerates server/db/auth-schema.ts
npm run db:generate && npm run db:migrate
```

## How auth works

- Better Auth serves `/api/auth/*` (email+password enabled,
  `minPasswordLength: 6` to match the client copy).
- The **bearer plugin** returns the session token in the `set-auth-token`
  response header on sign-in/sign-up. The client stores it (secure storage on
  device) and sends `Authorization: Bearer <token>`.
- App profile fields (`timezone`, `notificationTime`, `tintIndex`) live on
  the Better Auth `user` table; `user.name` is the username.
- `GET /api/users/me` / `PATCH /api/users/me` read/update the profile
  (PATCH accepts `username`, `timezone`, `notificationTime`).

## Google / Apple login — setup checklist (you)

The server activates each provider only when its env vars are present
(`server/auth.ts`); until then the app's social buttons explain they're not
configured. No code changes needed — fill the credentials and restart.

### Google

1. https://console.cloud.google.com/apis/credentials → create an
   **OAuth 2.0 Client ID** (type: Web application).
2. Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`
   (locally: `http://localhost:8787/api/auth/callback/google`).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Apple

1. https://developer.apple.com/account/resources/identifiers → create an
   **App ID** and a **Services ID** (the Services ID becomes
   `APPLE_CLIENT_ID`), enable "Sign in with Apple".
2. Create a **Sign in with Apple key**, then generate the client secret JWT
   (ES256, signed with that key — Apple secrets are JWTs, not static
   strings). Set it as `APPLE_CLIENT_SECRET`.
3. Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/apple`. Apple requires
   HTTPS — test against a deployed URL, not localhost.
4. For native sign-in set `APPLE_APP_BUNDLE_IDENTIFIER` to the app's bundle id.

### Client-side wiring (later, with credentials in place)

The social flow on native needs an OAuth redirect back into the app
(`expo-web-browser` + the app scheme, or Better Auth's `@better-auth/expo`
client). The scaffold keeps the UI in place; wire the buttons to
`/api/auth/sign-in/social` when the consoles above are set up.

## Deploy to Vercel

1. Vercel project on this repo. `vercel.json` disables framework detection;
   only `api/[[...route]].ts` is deployed (one function serving all of
   `/api/*`).
2. Create a Supabase cloud project; run migrations against it:
   `DATABASE_URL=<direct-connection-url> npm run db:migrate`.
3. Project env vars:
   - `DATABASE_URL` — the Supabase **transaction pooler** URL (port 6543;
     the driver already runs `prepare: false`)
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — `https://<project>.vercel.app`
   - `CORS_ORIGINS` — comma-separated web origins of the client
   - the Google/Apple vars above, when ready
4. Point the app at it: `EXPO_PUBLIC_API_URL=https://<project>.vercel.app`.

## Not wired yet (next sessions)

- Pacts / check-ins / friends / notifications endpoints (the domain tables
  and rules already exist in `server/db/schema.ts`).
- Settings-screen profile edits still persist locally only; wire them to
  `PATCH /api/users/me`.
- Server cron schedulers to replace `src/lib/engine.ts` (Vercel cron →
  Hono routes), then remote push via FCM.
