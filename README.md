# HubBot - Dynamic Voice Channel Bot

HubBot is a Discord bot that manages temporary voice channels. When a user joins a designated "Hub" channel, the bot creates a new private voice channel for them and moves them into it. The creator becomes the owner and can manage the channel via a control panel pinned in the voice channel's text chat.

## Features

- **Automatic Channel Creation**: Users join a Hub channel to get their own temporary room.
- **Control Panel**: Manage channel name, privacy (lock/unlock), and user limits via an easy-to-use embed.
- **Auto-Cleanup**: Channels are automatically deleted when they become empty.
- **Persistence**: Remembers active channels across restarts using SQLite.
- **Dockerized**: Easy deployment with Docker Compose.

## Setup

1.  **Discord Bot Token**: Create a bot on the [Discord Developer Portal](https://discord.com/developers/applications).
    - Enable **Guilds** and **Guild Voice States** intents.
2.  **Configuration**: Copy `.env.example` to `.env` and fill in your details:
    - `DISCORD_TOKEN`: Your bot token.
    - `HUB_CHANNEL_ID`: The ID of the voice channel users join to create a room.
    - `CATEGORY_ID`: The ID of the category where new rooms will be created.
3.  **Deployment**:
    ```bash
    docker-compose up -d
    ```

## Permissions Needed

The bot requires the following permissions in the target category:
- Manage Channels
- Manage Roles (to toggle privacy)
- Move Members
- Send Messages
- Embed Links
- Read Message History
- Pin Messages
