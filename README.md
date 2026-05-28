# 平行宇宙的回声 / Echoverse OS

Echoverse OS is an open-source emotional personal AI system that creates an Echo Profile through conversation, generates life letters, and visualizes an inner parallel world.

> 不是复制另一个你，而是让那些没被现实听见的你，终于有回声。

It is not a generic chatbot. It is a warm private inner world: part digital memory archive, part life-letter system, part poetic world simulator for the self that reality did not fully hear.

## Core Idea

Echoverse OS helps a user build a readable, editable, exportable digital memory library through conversation. From that memory library, it forms a parallel-world embodiment: not a clone, but another possible self shaped by the user's memories, personality clues, preferences, regrets, wishes, and decision patterns.

The V1 MVP focuses on one complete loop:

1. Speak in the Echo Room.
2. Extract long-term memories.
3. Generate an Echo Profile.
4. Ask real-life questions through Life Letters.
5. Visualize the user's inner state in Parallel World Lite.

## Features

- **Home**: premium product story and world-building entry.
- **Echo Room**: warm AI conversation, message persistence, memory extraction.
- **Echo Profile**: editable Soul Document sections generated from memories.
- **Life Letters**: reflective replies based on profile and recent memories.
- **Parallel World Lite**: emotional scene, daily state, poetic diary.
- **Export**: downloads `echo-profile.zip` with Markdown sections and JSON.

## Tech Stack

- Next.js App Router
- TypeScript
- TailwindCSS
- Prisma
- SQLite
- OpenAI-compatible GPT API
- Framer Motion
- Lucide React
- JSZip

## Getting Started

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Environment Variables

Create `.env`:

```bash
DATABASE_URL="file:./dev.db"
GPT_API_KEY="your_gpt_api_key"
GPT_BASE_URL="https://your-provider.example/v1"
GPT_MODEL="gpt-4.1-mini"
GPT_PROVIDER="openai-compatible"
GPT_TIMEOUT_MS="45000"
GPT_MAX_RETRIES="1"
GPT_RESPONSE_FORMAT="json_object"

# Optional fallback if you use the official OpenAI endpoint instead of GPT_*.
OPENAI_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_MODEL=""
```

Without `GPT_API_KEY` or `OPENAI_API_KEY`, the static UI still works, but AI routes will return warm configuration errors. Use `GET /api/ai/status` to inspect the active provider config, and `POST /api/ai/status` after login to run a small live connectivity test.

## Database

Prisma models:

- `ConversationMessage`
- `Memory`
- `ProfileDocument`
- `LifeLetter`
- `WorldState`

Useful commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Screenshots

Screenshots can be added here:

- `screenshots/home.png`
- `screenshots/echo-room.png`
- `screenshots/profile.png`
- `screenshots/letters.png`
- `screenshots/world.png`

## Roadmap

**V1**

- Static polished WebUI
- Echo Room chat API
- Memory extraction
- Echo Profile generation and editing
- Life Letter generation
- Parallel World daily diary
- ZIP export

**V2**

- richer onboarding through cards, choices, and lightweight rituals
- long-term memory review and conflict resolution
- timeline and life-branch visualization
- deeper parallel-world simulation events
- user-controlled privacy and deletion workflows
- optional account system and encrypted sync

**Future Integrations**

- MCP tool access for personal workflows
- Hermes-style agent orchestration
- OpenClaw-style computer/task automation
- user-approved work and life assistant actions

## Privacy Notes

Echoverse OS stores personal memories locally in SQLite by default. Users can read, edit, and export their Echo Profile. Future cloud or multi-device versions should add explicit consent, encryption, deletion, and data portability controls before syncing sensitive memory data.

## Safety Notes

Echoverse OS is not a therapist and does not replace professional help.

The system should not:

- diagnose mental health conditions
- provide medical, legal, or financial conclusions
- make major life decisions for the user
- manipulate the user's emotions
- encourage avoidance of reality

If a user expresses immediate self-harm, suicide, or harm-to-others risk, the product should recommend contacting local emergency services or a qualified professional immediately.
