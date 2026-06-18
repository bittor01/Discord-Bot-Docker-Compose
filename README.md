# HubBot - Dynamic Voice Channel Bot

HubBot is a Discord bot that manages temporary voice channels. When a user joins a designated "Hub" channel, the bot creates a new private voice channel for them and moves them into it. The creator becomes the owner and can manage the channel via a control panel pinned in the voice channel's text chat.

## Features

- **Automatic Channel Creation**: Users join a Hub channel to get their own temporary room.
- **Control Panel**: Manage channel name, privacy (lock/unlock), and user limits via an easy-to-use embed.
- **Auto-Cleanup**: Channels are automatically deleted when they become empty.
- **Gamification**: Earn XP and level up by spending time in voice channels. Includes custom scaling, AFK detection, and medal ranks.
- **Persistence**: Remembers active channels and user levels across restarts using SQLite.
- **Dockerized**: Easy deployment with Docker Compose.

## Setup

### 1. Discord Developer Portal Configuration
Create an application on the [Discord Developer Portal](https://discord.com/developers/applications).

#### OAuth2 Scopes
- `bot` (Standard bot functionality)

#### Privileged Gateway Intents
- **Guilds**: Required to manage channels.
- **Guild Voice States**: Required to detect users joining/leaving voice channels.
- **NOTE**: This bot does **NOT** require the *Message Content* intent.

#### Bot Permissions
The bot follows the principle of least privilege. It only needs permissions to manage the channels it creates and static channels you specify:
- **Manage Channels**: To create/delete rooms and toggle privacy (Lock/Unlock) via channel overwrites.
- **Move Members**: To move users from the Hub to their new room.
- **View Channel**: To see the Hub, Category, and static channels.
- **Send Messages**: To post the control panel and level-up embeds.
- **Embed Links**: To format embeds.
- **Manage Messages**: Required to **Pin** the control panel message.

### 2. Gamification System
HubBot awards XP every minute to users in managed voice channels and configured static channels.
- **XP Scaling**: Levels grow by a configurable percentage (e.g., 10% more XP per level).
- **Voice State Modifiers**: XP gain is reduced if a user is muted or deafened.
- **Level-Up Notifications**: Sent to the voice channel's built-in text chat. Includes a Bronze, Silver, or Gold medal based on the user's XP percentile relative to others.
- **Spam Protection**: Notifications are throttled (default 15 mins) to prevent spamming the chat during rapid leveling.

### 2. Configuration
Copy `.env.example` to `.env` and fill in your details:
- `DISCORD_TOKEN`: Your bot token.
- `HUB_CHANNEL_ID`: The ID of the voice channel users join to create a room.
- `CATEGORY_ID`: The ID of the category where new rooms will be created.

### 3. Deployment
```bash
docker-compose up -d
```
