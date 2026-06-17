# HubBot Design Document

## System Architecture
HubBot is a containerized Node.js application using `discord.js` (v14) and `better-sqlite3`.

## Database Schema (state.db)
Table: `active_channels`
- `voice_channel_id` (TEXT, PK): The ID of the generated voice channel.
- `owner_id` (TEXT): The ID of the user who created/owns the channel.
- `control_message_id` (TEXT): The ID of the Embed message hosting the control buttons.

## Logic Overview
- **Creation**: Triggered when joining `HUB_CHANNEL_ID`. Creates a voice channel and pins a control message in its built-in text chat.
- **Interactions**: Owner can edit name, toggle privacy, and set user limits via buttons/menus.
- **Cleanup**: Triggered when the voice channel becomes empty. Deletes channel and DB row.
- **Recovery**: On boot, checks for abandoned channels in the database and cleans them up.
