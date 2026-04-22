# VISION.md — Long-Term Product Vision

## The Premise

Every person carries a garden.

Some relationships flourish — visited often, tended with care, full of light and fruit. Others wither quietly. Not from lack of love, but from the ordinary forgetting that comes with a full life.

Garden is a tool for the person who refuses to let that forgetting win. It is a private record of deliberate love — a place to remember who you have prayed for, who you have shared a meal with, who you have had the courage to be honest with, who has served others selflessly.

The garden metaphor is not decoration. It is the structure of the app's moral imagination. A plant is not a contact. A soul is not a row in a database. The language of tending, watering, sunlight, and fruit carries weight because it has always carried weight. Every major spiritual tradition has used the image of the garden to talk about the cultivation of virtue, the care of souls, and the patient labor of love.

Garden does not explain this to the user. The user already knows. Garden simply gives them a place to practice it.

---

## What the App Should Feel Like

Opening Garden should feel like stepping into a quiet room.

Not urgent. Not gamified. Not cluttered with notifications demanding action. The garden is always there. Some plants need attention. Some are flourishing. The user decides what to do about it.

The visual language — green gradients, muted earth tones, SVG plant illustrations that shift from tender shoot to full bush — should feel like early morning light through a window. Intentional. Warm. Unhurried.

A user logging a Sunlight entry (a prayer for someone) should feel the same quiet gravity they feel in the act itself. The modal should not cheer them on or count their streak. It should simply receive the information and close.

**The app should recede.** It is not the center of the practice. The relationships are. Garden is a memory tool and a gentle accountant of care.

---

## Guiding Principles for All Future Decisions

### 1. Privacy as Love, Not Just Policy
The user's relationships are sacred. The fact that they are encrypted and never exposed to any server is not a technical feature — it is an expression of respect. Every future feature must maintain this standard. Sharing always requires explicit, revocable consent. No behavioral analytics. No aggregate data mining. No "garden insights" dashboard that reduces human relationships to percentages.

### 2. Offline as First-Class
The app must work fully without internet. Not "mostly." Fully. A user at a remote monastery, on a long flight, in a country with spotty data — they should experience the complete app. Cloud sync is a gift, not a dependency.

### 3. The Metaphor Is the Product
Every feature decision should ask: does this deepen the garden metaphor, or does it break it? A feature that turns Garden into a CRM breaks it. A feature that lets a user visualize their garden as a living landscape deepens it. A streak counter breaks it. A plant that gradually shows fruit over time as the user logs service activities deepens it.

### 4. One Gardener, One Garden
Garden is a personal tool. It is not a team product. Sharing features, when they arrive, must be strictly opt-in, plant-level, and fully reversible. A user should never feel that their garden is exposed, monitored, or evaluated by others.

### 5. Sustainability Over Features
The app should do a small number of things very well. New features should pass a high bar: does this serve the core spiritual practice of caring for relationships? If a feature could belong in any generic productivity app, it probably does not belong in Garden.

---

## Long-Range Phases

### Near Term — Solidify the Core (Phase 2)
Complete the image system with E2EE at rest in Supabase Storage. Make multi-device sync seamless. Add passphrase idle-lock for users who share devices.

### Medium Term — Open the Garden to Collaboration (Phase 3)
Introduce plant sharing — where two Garden users can co-tend a single plant, each seeing the other's care activities. This is particularly meaningful for spiritual mentors, prayer partners, or couples who share pastoral responsibility. Introduce multilingual support (English, Spanish, French) to serve the global communities that are the app's natural audience. Introduce anonymized activity reports for users who want a periodic reflection on their relational practice without exposing private details.

### Longer Term — See the Garden (Phase 4)
The garden visualization — a top-down, living map of the user's entire relational world — is the capstone feature. Using Phaser or a similar WebGL-capable library, the user will be able to see all of their plants arranged spatially, connected by companion relationships, visually expressing their health state through animation and color. This is not a gamification feature. It is an artistic representation of something the user has built over years: a living record of their care.

### Ongoing — Identity and Trust (Phase 5)
Key rotation, biometric unlock, and passphrase protection of the garden key file itself. The long-term vision is that a user's Garden key is as precious and portable as a passport, and as secure as a safe.

---

## Anti-Features

The following features will never be added to Garden, regardless of user requests:

- **Streaks and habit tracking metrics.** They corrupt the intrinsic motivation that makes spiritual practice meaningful.
- **Social feeds or discovery.** No one should be able to find another user's garden. No profiles. No followers.
- **AI-generated relationship suggestions.** "You haven't visited Sarah in a while — here's a message to send." This is a profound category error. Garden does not generate acts of love.
- **Advertising or monetization through data.** The app may eventually support a subscription or one-time purchase. It will never support advertising or data brokerage.
- **Public sharing of any activity.** "I prayed for John today" should never be sharable to any platform.
- **Productivity integrations.** No Zapier hooks, no calendar sync, no CRM export. Garden is not a workflow tool.
- **Leaderboards or community comparisons.** No visibility into how other users tend their gardens.

---

## The User Garden Belongs To

The primary user of Garden is someone who:

- Takes their relationships seriously as a spiritual practice.
- Belongs to a faith community (Bahá'í, Christian, Jewish, Muslim, or any tradition that uses relational language around growth and service).
- Is not necessarily technical, but is thoughtful about their privacy.
- Maintains a circle of people they feel called to nurture — not a network of contacts, but a garden of souls.
- Does not want to be tracked, analyzed, or compared.

Garden is built for this person. Every design decision is made in their service.
