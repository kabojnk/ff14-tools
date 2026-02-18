# Chat System

A private, two-person Discord-like chat application with real-time messaging, media sharing, and built-in panic-hide features.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS v4 |
| State | Zustand |
| Backend | Supabase (Auth, Postgres, Realtime, Edge Functions) |
| Media CDN | bunny.net |
| GIF Search | Tenor API |
| Deployment | Docker (nginx) on DigitalOcean |

## Features

- Real-time text messaging with Discord-style markdown (bold, italic, code, spoilers, quotes)
- Text channels (create, archive)
- Media uploads (images, video, files) with spoiler support
- GIF search via Tenor
- Emoji picker + custom emoji upload
- Emoji reactions on messages
- Message editing and deletion
- User presence (Online / Away / Offline) + custom status
- Typing indicators
- Changeable nicknames, avatars, and profile messages
- Color theming (Dark, Light, Midnight)
- Mobile responsive
- **Change the Sheets** — instantly wipe visible chat history (non-destructive, recoverable via DB)
- **Eep! Mode** — panic button that disguises the app as an FF14 raid picker
- Slash commands: `/sheets`, `/eep`

## Quick Start

See [SETUP.md](./SETUP.md) for full setup instructions.

```bash
# Install dependencies
npm install

# Copy environment file and fill in your values
cp .env.example .env

# Start development server
npm run dev
```

## Project Structure

```
src/
├── components/       # React components
│   ├── auth/         # Login page
│   ├── channels/     # Channel list, header, create modal
│   ├── chat/         # Messages, input, emoji, GIF, reactions, markdown
│   ├── eep/          # Eep! mode (FF14 disguise)
│   ├── layout/       # App shell, sidebar, mobile nav
│   ├── sheets/       # Change the Sheets button
│   └── user/         # User panel, settings, status, avatar
├── hooks/            # Custom React hooks
├── lib/              # Supabase client, markdown parser, API clients
├── stores/           # Zustand state stores
└── types/            # TypeScript interfaces

supabase/
├── migrations/       # SQL migration files (run in order)
└── functions/        # Edge Functions (upload-media, tenor-search)

docker/
├── Dockerfile        # Multi-stage build (node -> nginx)
└── nginx.conf        # SPA routing config
```
