# HubBot Design Document (v2)

## System Architecture
HubBot is a containerized Node.js application using `discord.js` (v14), `better-sqlite3`, and `canvas`.

## XP & Acclimation System
- **Acclimation**: Users joining a VC start at 0% acclimation. This scales linearly to 100% over 15 minutes.
- **Grace Period**: If a user leaves, their acclimation stays for 7.5m, then decays back to 0% over another 7.5m.
- **Group Multiplier**:
    - Based on "Fallout" system where more people = more XP.
    - Each additional person provides a bonus (default 0.5x, 0.25x, etc. decaying exponentially).
    - Multiplier is modified by the *contributing* member's acclimation.
- **Screenshare**: Provides a flat multiplier (default 1.5x).

## Database Schema (state.db)
Table: `active_channels`
- `voice_channel_id` (TEXT, PK)
- `owner_id` (TEXT)
- `control_message_id` (TEXT)

Table: `users`
- `user_id` (TEXT, PK)
- `xp`, `weekly_xp`, `monthly_xp` (REAL)
- `level`, `weekly_level`, `monthly_level` (INTEGER)

Table: `achievements`
- `achievement_id` (TEXT, PK)
- `name`, `description`, `icon` (TEXT)
- `xp_reward` (REAL)

Table: `user_achievements`
- `user_id`, `achievement_id`, `period_key` (Composite PK)

Table: `session_state`
- `user_id` (TEXT, PK)
- `channel_id`, `acclimation_percent`, `last_seen_timestamp`, `is_sharing_screen`

## UI & Rendering
- **Category Hierarchy**: Managed voice channels and associated text channels (output, leaderboards) may coexist within the same category. The bot specifically filters for `GuildVoice` type during cleanup and recovery to avoid affecting non-voice channels.
- **Pinned Embed**: Refreshes every 10 seconds with a Canvas-rendered image showing member acclimation bars and multipliers.
- **Stats Card**: Canvas-rendered image for `/stats` showing level, XP progress, and achievements.
- **Rate Limiting**: Global "Leaky Bucket" limiter ensures Discord API calls stay under 25/second.
- **Workers**: Canvas rendering is offloaded to `worker_threads`.

## Commands
- `/stats [user]`: View level and XP card.
- `/leaderboard [period]`: View top players.
- `/givexp`, `/giveachievement`, `/resetuser`: Admin commands restricted by role.

## Permission Logic
- **Default State**: New channels are created in a **Private** but **Unlocked** state. `@everyone` is denied `ViewChannel`. The creator is granted explicit `ViewChannel` permission.
- **Locking**: Snapshots current members and grants them explicit `Connect` permission, then denies `Connect` to `@everyone`. This prevents new members from joining. Unlocking clears these overrides.
- **Privacy (Visibility)**: Snapshots current members and grants them explicit `ViewChannel`, then denies `ViewChannel` to `@everyone`. Making Public clears these overrides.
- **Re-entry Restriction**: If a user's session expires (after the grace/decay period) while their channel is Locked or Private, their explicit permission overwrite is deleted to prevent them from re-joining.
