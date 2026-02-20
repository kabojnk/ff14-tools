# Setup Guide

Complete instructions for setting up and running the chat system locally and in production.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) account (free tier works)
- A [bunny.net](https://bunny.net) account with a Storage Zone and Pull Zone
- A [Klipy API key](https://partner.klipy.com) (free — sign up, add a platform, and copy your key)
- (For deployment) A DigitalOcean account and Docker installed

---

## 1. Supabase Setup

### Create a project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Publishable key** from Settings > API (previously called the "anon public key" — same thing, just renamed)

### Run database migrations

Run each SQL file in order in the Supabase SQL Editor (Dashboard > SQL Editor > New Query):

```
supabase/migrations/00001_create_profiles.sql
supabase/migrations/00002_create_channels.sql
supabase/migrations/00003_create_sessions.sql
supabase/migrations/00004_create_messages.sql
supabase/migrations/00005_create_reactions.sql
supabase/migrations/00006_create_custom_emoji.sql
supabase/migrations/00007_create_settings.sql
```

These create all tables, RLS policies, indexes, triggers, RPC functions, and seed data.

### Configure Auth

1. Go to Authentication > Providers
2. Ensure **Email** provider is enabled
3. Optionally disable "Confirm email" for easier dev testing (Authentication > Settings)

### Enable Realtime

1. Go to **Database > Publications**
2. Click on **supabase_realtime**
3. Toggle on `messages`, `reactions`, and `profiles`

### Deploy Edge Functions

Install the Supabase CLI if you haven't:

```bash
npm install -g supabase
```

Link your project and deploy:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy upload-media
supabase functions deploy gif-search
```

Set the required secrets for the Edge Functions:

```bash
supabase secrets set BUNNY_API_KEY=your-storage-zone-password
supabase secrets set BUNNY_STORAGE_ZONE=your-storage-zone-name
supabase secrets set BUNNY_STORAGE_HOST=your-region-hostname  # e.g. storage.bunnycdn.com, uk.storage.bunnycdn.com, de.storage.bunnycdn.com
supabase secrets set BUNNY_CDN_URL=https://your-pullzone.b-cdn.net
supabase secrets set KLIPY_API_KEY=your-klipy-api-key
```

---

## 2. bunny.net Setup

1. Log into [bunny.net](https://bunny.net)
2. Create a **Storage Zone** (e.g., `chat-media`)
3. Create a **Pull Zone** linked to that Storage Zone
4. Note your:
   - **Storage Zone Password** (Storage Zone > FTP & API Access > **Password** — this is NOT your account API key, it's specific to the storage zone)
   - **Storage Zone name** (the name you chose)
   - **FTP Hostname** (Storage Zone > FTP & API Access > **FTP Hostname** — region-specific, e.g. `storage.bunnycdn.com`, `uk.storage.bunnycdn.com`, `de.storage.bunnycdn.com`)
   - **Pull Zone URL** (e.g., `https://chat-media.b-cdn.net`)

---

## 3. Local Development

### Install dependencies

```bash
npm install
```

### Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BUNNY_CDN_URL=https://your-pullzone.b-cdn.net
```

### Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Register users

1. Open the app and click "Register"
2. Create two accounts (one for each person)
3. Log in with either account to start chatting

---

## 4. Customization

### Change the Eep! passphrase

The default passphrase is `the_epic_of_alexander`. To change it:

1. Go to the Supabase Dashboard > Table Editor > `settings`
2. Find the row with key `eep_passphrase`
3. Update the `value` column to your desired passphrase

### Restore archived channels

1. Go to Supabase Dashboard > Table Editor > `channels`
2. Find the archived channel and set `archived` to `false`

### Restore hidden sessions (after Change the Sheets)

1. Go to Supabase Dashboard > Table Editor > `sessions`
2. Find the session(s) you want to restore and set `visible` to `true`
3. Note: making a session visible again will cause its messages to reappear in chronological order

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+E` | Activate Eep! mode |
| `Escape` (double-tap) | Activate Eep! mode |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Escape` (while editing) | Cancel edit |

## 6. Slash Commands

| Command | Action |
|---------|--------|
| `/sheets` | Change the Sheets (wipe visible chat in current channel) |
| `/eep` | Activate Eep! mode |
