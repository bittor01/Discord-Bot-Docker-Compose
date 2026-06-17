# HubBot - Dynamic Voice Channel Bot

HubBot is a Discord bot that manages temporary voice channels. When a user joins a designated "Hub" channel, the bot creates a new private voice channel for them and moves them into it. The creator becomes the owner and can manage the channel via a control panel pinned in the voice channel's text chat.

## Features

- **Automatic Channel Creation**: Users join a Hub channel to get their own temporary room.
- **Control Panel**: Manage channel name, privacy (lock/unlock), and user limits via an easy-to-use embed.
- **Auto-Cleanup**: Channels are automatically deleted when they become empty.
- **Persistence**: Remembers active channels across restarts using SQLite.
- **Dockerized**: Easy deployment with Docker Compose.

## Setup

### 1. Discord Developer Portal Configuration
Create an application on the [Discord Developer Portal](https://discord.com/developers/applications).

#### OAuth2 Scopes
- `bot`
- `applications.commands` (required for buttons/menus/modals to work correctly in some contexts)

#### Privileged Gateway Intents
- **Guilds**: Required to manage channels.
- **Guild Voice States**: Required to detect users joining/leaving voice channels.

#### Bot Permissions
The bot needs the following permissions (assigned in the OAuth2 URL generator or manually in the Hub category):
- **Manage Channels**: To create and delete temporary rooms.
- **Manage Roles**: To toggle privacy (Lock/Unlock) by editing role overwrites.
- **Move Members**: To move users from the Hub to their new room.
- **View Channel**: To see the Hub and Category.
- **Connect / Speak**: To operate in voice channels.
- **Send Messages**: To post the control panel.
- **Embed Links**: To format the control panel.
- **Read Message History**: To fetch the control panel for recovery.
- **Manage Messages**: Required to **Pin** the control panel message.

### 2. Configuration
Copy `.env.example` to `.env` and fill in your details:
- `DISCORD_TOKEN`: Your bot token.
- `HUB_CHANNEL_ID`: The ID of the voice channel users join to create a room.
- `CATEGORY_ID`: The ID of the category where new rooms will be created.

### 3. Deployment
```bash
docker-compose up -d
```
