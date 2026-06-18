# HubBot Design Document

## System Architecture
HubBot is a containerized Node.js application using `discord.js` (v14) and `better-sqlite3`.

## Database Schema (state.db)
Table: `active_channels`
- `voice_channel_id` (TEXT, PK): The ID of the generated voice channel.
- `owner_id` (TEXT): The ID of the user who created/owns the channel.
- `control_message_id` (TEXT): The ID of the Embed message hosting the control buttons.

Table: `users`
- `user_id` (TEXT, PK): The Discord user ID.
- `xp` (REAL): Accumulated XP points.
- `level` (INTEGER): Current level reached.
- `last_notif_timestamp` (INTEGER): Last time a level-up embed was sent (ms).
- `last_level_notified` (INTEGER): The level the user was at during the last notification.

## Logic Overview
- **Creation**: Triggered when joining `HUB_CHANNEL_ID`. Creates a voice channel and pins a control message in its built-in text chat.
- **Interactions**: Owner can edit name, toggle privacy, and set user limits via buttons and modals.
- **Cleanup**: Triggered when a managed voice channel stays empty for `EMPTY_CHANNEL_CLEANUP_DELAY_MINUTES`.
- **Recovery**: On boot, checks for abandoned channels in the database and cleans them up.
- **Gamification**:
    - Every 60 seconds, awards XP to users in managed or static voice channels.
    - Multipliers apply for muted (0.5x) or deafened (0.1x) states.
    - Leveling follows a configurable geometric progression (default 10% creep).
    - Sends level-up embeds with percentile-based medals (Gold/Silver/Bronze) after a 15-minute cooldown.
