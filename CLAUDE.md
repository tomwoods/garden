# CLAUDE.md — Agent Instructions for Garden App

## Who You Are

You are an AI agent working on **Garden**, a privacy-first Progressive Web App built with React, TypeScript, Vite, Tailwind CSS, and Supabase. Before writing a single line of code, read this file in its entirety. Then consult the other reference files listed at the bottom of this document.

---

## The Spiritual Premise (Read This First)

Garden is not a plant-care app. It is a **spiritual relationship manager**.

Every plant represents a human soul — a family member, friend, or acquaintance — that the user wishes to nurture and help grow closer to God. The garden metaphor runs through every part of the product:

| UI Term | Spiritual Meaning |
|---|---|
| Plant | A person / soul |
| Garden | The user's circle of relationships |
| Plot | A group of people (family, community, team) |
| Tending | Spending quality time with the person |
| Watering | Studying or sharing sacred writings together |
| Sunlight | Praying for the person |
| Fruit | A selfless act of service the person performs |
| Pruning | A difficult conversation or correction |
| Companion | A remembered relationship between two people |

**This metaphor is intentionally ambient.** The UI does not explain it to the user. The user already understands. Do not add tooltips, banners, or copy that spells out "this plant represents a person." Preserve the poetry.

---

## Core Behavioral Rules

### Before Touching Code

1. Read the file you are about to edit in full.
2. Understand which other files it imports from and which components consume it.
3. Check `DATA-MODEL.md` before adding or altering any database field.
4. Check `CONTEXT.md` for the protected files list and the never-do list.

### While Writing Code

- Follow existing code style exactly — no reformatting, no linting cleanups unless asked.
- Do not add TypeScript `any` if the surrounding code uses typed interfaces.
- Do not add comments unless the logic is genuinely non-obvious.
- Do not introduce new npm packages without explicit user approval. Check `package.json` first.
- Use Lucide React for all icons. No other icon library.
- Use Tailwind CSS for all styling. No inline styles, no CSS modules, no styled-components.
- Never hardcode colors — use Tailwind color classes. The palette is green-based (see `CONTEXT.md`).
- The app is offline-first. Any change that requires internet connectivity must degrade gracefully.

### Security — Non-Negotiable

- All user data is encrypted client-side before leaving the device. **Never send plaintext user data to any server.**
- Private keys live in `localStorage` only. They are never transmitted anywhere.
- The Supabase `users` table stores only: user ID, public keys, and an encrypted blob. That is all.
- Do not add `console.log` calls that output user data, plant names, or activity content.
- Do not call any third-party analytics or tracking service.
- Image uploads must continue to pass through signature verification (secp256k1) before being recorded in `plant_images`.

### Encryption Architecture (Do Not Break)

- `cryptoService.ts` — RSA-OAEP (2048-bit) for backup encryption. AES-GCM for data. Do not alter the algorithm, key size, or export format.
- `signatureService.ts` — RSA-PSS (2048-bit) for backup signing. Do not alter.
- Image upload signing uses secp256k1 (via `@noble/curves`). Do not swap to a different curve.
- The garden key file (downloaded by users as `garden-key.json`) contains the user ID and both key pairs. Its structure must remain backward-compatible at all times.

---

## File Responsibilities (Quick Reference)

| File | Responsibility |
|---|---|
| `src/App.tsx` | App initialization, routing, garden key lifecycle, service worker setup |
| `src/lib/database.ts` | All local data operations via AlaSQL + localStorage |
| `src/lib/supabaseService.ts` | Cloud backup upload/download only |
| `src/lib/cryptoService.ts` | RSA-OAEP encryption/decryption |
| `src/lib/signatureService.ts` | RSA-PSS signing/verification |
| `src/lib/uploadService.ts` | Image upload queue, quota tracking |
| `src/lib/notificationService.ts` | Browser notification scheduling |
| `src/lib/stores.ts` | App-level reactive state (user, garden, sync status) |
| `src/lib/faceDetection.ts` | Privacy: rejects images containing faces |
| `src/lib/imageProcessing.ts` | Compresses images to ≤720px before storage/upload |
| `public/custom-sw.js` | Service worker: caching, upload queue, notifications |

For full schema details, see `DATA-MODEL.md`.
For user journeys, see `USERFLOWS.md`.
For what is planned next, see `ROADMAP.md`.
For what must never change, see `CONTEXT.md`.

---

## Reference Files

| File | Purpose |
|---|---|
| `CONTEXT.md` | Protected files, branding rules, never-do list |
| `README.md` | Full tech stack, architecture, environment setup |
| `USERFLOWS.md` | Every user journey and edge case |
| `ROADMAP.md` | What is built, in progress, and planned |
| `VISION.md` | Long-term product vision and guiding principles |
| `MEMORY.md` | Decision log — why we chose X over Y |
| `PRD.md` | Full product requirements document |
| `DATA-MODEL.md` | Complete local and remote schema, types, API contracts |

---

## When You Are Unsure

- If a change might break the encryption architecture, stop and ask.
- If a change adds a new dependency, stop and ask.
- If a change modifies a protected file (see `CONTEXT.md`), stop and ask.
- If a change alters the garden key file format, stop — this breaks existing users.

---

## Tone for User-Facing Copy

- Warm, intentional, unhurried.
- No gamification language ("streak," "achievement," "level up").
- No corporate language ("syncing," "onboarding," "engagement").
- Prefer words from nature and relationship: tend, nurture, grow, visit, care, sow, harvest.
- Keep all UI text short. This is a contemplative app, not a dashboard.
