/**
 * HubBot - Dynamic Voice Channel Bot
 *
 * This bot creates temporary voice channels when users join a designated "Hub" channel.
 * It provides a control panel for owners to manage their channels.
 */

// Load environment variables from .env file
require('dotenv').config();

// Import necessary classes from discord.js
const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType
} = require('discord.js');

// Import database helper functions
const db = require('./database');

// Track when channels become empty for delayed cleanup
// Key: Channel ID, Value: Timestamp (Date.now())
const emptyChannels = new Map();

// Initialize the Discord client with required intents
// Guilds: To manage channels
// GuildVoiceStates: To detect users joining/leaving voice channels
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Helper: Calculate XP required for a specific level
// Each level requires XP_LEVEL_RAMP more than the previous level
function getXPForLevel(level) {
    const base = parseFloat(process.env.XP_LEVEL_BASE) || 900;
    const ramp = parseFloat(process.env.XP_LEVEL_RAMP) || 1.1;
    if (level <= 0) return 0;
    // XP for level N = base * (ramp ^ (N-1))
    return Math.floor(base * Math.pow(ramp, level - 1));
}

// Helper: Calculate level from total XP
function getLevelFromXP(totalXP) {
    let level = 0;
    let xpNeeded = getXPForLevel(level + 1);
    while (totalXP >= xpNeeded) {
        totalXP -= xpNeeded;
        level++;
        xpNeeded = getXPForLevel(level + 1);
    }
    return level;
}

// Event: Client is ready
client.once('ready', async () => {
    // Log successful login
    console.log(`Logged in as ${client.user.tag}!`);

    // Start the background maintenance task (runs every 60 seconds)
    // This handles both XP awarding and delayed channel cleanup
    setInterval(async () => {
        try {
            // Configuration for XP
            const xpPerSecond = process.env.XP_PER_SECOND !== undefined ? parseFloat(process.env.XP_PER_SECOND) : 1;
            const multiplierMuted = process.env.XP_MULTIPLIER_MUTED !== undefined ? parseFloat(process.env.XP_MULTIPLIER_MUTED) : 0.5;
            const multiplierDeafened = process.env.XP_MULTIPLIER_DEAFENED !== undefined ? parseFloat(process.env.XP_MULTIPLIER_DEAFENED) : 0.1;
            const cooldownMs = (parseInt(process.env.NOTIFICATION_COOLDOWN_MINUTES) || 15) * 60 * 1000;
            const staticChannels = (process.env.STATIC_CHANNELS || '').split(',').map(id => id.trim()).filter(id => id.length > 0);

            // Fetch all managed channels from database
            const activeChannels = db.getAllChannels().map(c => c.voice_channel_id);
            // Use a Set to ensure we don't process the same channel twice
            const validChannels = new Set([...activeChannels, ...staticChannels]);

            // Track current maintenance time
            const now = Date.now();
            const cleanupDelayMs = (parseInt(process.env.EMPTY_CHANNEL_CLEANUP_DELAY_MINUTES) || 0) * 60 * 1000;

            for (const channelId of validChannels) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel || channel.type !== ChannelType.GuildVoice) {
                    // Clean up DB if channel is gone
                    if (!channel && activeChannels.includes(channelId)) {
                        db.removeChannel(channelId);
                        emptyChannels.delete(channelId);
                    }
                    continue;
                }

                // --- 1. Delayed Cleanup Logic ---
                const isManaged = activeChannels.includes(channelId);
                if (isManaged) {
                    if (channel.members.size === 0) {
                        // Mark as empty if not already tracked
                        if (!emptyChannels.has(channelId)) {
                            emptyChannels.set(channelId, now);
                        }

                        const emptySince = emptyChannels.get(channelId);
                        if (now - emptySince >= cleanupDelayMs) {
                            try {
                                await channel.delete('Temporary channel empty for delay period');
                                db.removeChannel(channelId);
                                emptyChannels.delete(channelId);
                                console.log(`Cleaned up empty channel: ${channelId} (Empty for ${Math.round((now - emptySince) / 1000)}s)`);
                                continue; // Skip XP awarding for this deleted channel
                            } catch (err) {
                                console.error(`Error deleting channel ${channelId}:`, err);
                            }
                        }
                    } else {
                        // Channel is no longer empty
                        emptyChannels.delete(channelId);
                    }
                }

                // --- 2. XP Awarding Logic ---

                // Skip AFK channels
                if (channel.id === channel.guild.afkChannelId) continue;

                for (const [memberId, member] of channel.members) {
                    if (member.user.bot) continue;

                    // Calculate multiplier based on voice state
                    let multiplier = 1.0;
                    if (member.voice.deaf || member.voice.selfDeaf) {
                        multiplier = multiplierDeafened;
                    } else if (member.voice.mute || member.voice.selfMute) {
                        multiplier = multiplierMuted;
                    }

                    // XP gain for 60 seconds
                    const xpGain = xpPerSecond * 60 * multiplier;
                    if (xpGain <= 0) continue;

                    // Get current user stats
                    const userRecord = db.getUser(memberId);
                    const newTotalXP = userRecord.xp + xpGain;
                    const newLevel = getLevelFromXP(newTotalXP);

                    // Update database
                    db.updateUserXP(memberId, xpGain, newLevel);

                    // Check for level-up notification
                    if (newLevel > userRecord.last_level_notified) {
                        const now = Date.now();
                        const timeSinceLastNotif = now - userRecord.last_notif_timestamp;

                        if (timeSinceLastNotif >= cooldownMs) {
                            // Calculate rank percentile for medal
                            const percentile = db.getUserPercentile(memberId);
                            let medal = '🥉 Bronze';
                            let color = 0xCD7F32; // Bronze

                            if (percentile >= 75) {
                                medal = '🥇 Gold';
                                color = 0xFFD700; // Gold
                            } else if (percentile >= 50) {
                                medal = '🥈 Silver';
                                color = 0xC0C0C0; // Silver
                            }

                            // Create Level-Up Embed
                            const levelUpEmbed = new EmbedBuilder()
                                .setTitle('🎊 Level Up!')
                                .setDescription(`Congratulations <@${memberId}>! You've reached **Level ${newLevel}**!`)
                                .addFields(
                                    { name: 'Rank', value: medal, inline: true },
                                    { name: 'Total XP', value: Math.floor(newTotalXP).toString(), inline: true }
                                )
                                .setColor(color)
                                .setTimestamp();

                            // Send to channel's built-in text chat
                            await channel.send({ embeds: [levelUpEmbed] }).catch(err => {
                                console.error(`Failed to send level-up message to ${channel.id}:`, err);
                            });

                            // Update notification status
                            db.updateLastNotified(memberId, newLevel, now);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in XP background task:', error);
        }
    }, 60000);

    // Perform recovery routine to clean up dead or empty channels
    console.log('Running recovery routine...');
    const CATEGORY_ID = process.env.CATEGORY_ID;
    const HUB_CHANNEL_ID = process.env.HUB_CHANNEL_ID;

    try {
        // Fetch all channels in the guild to find channels in our category
        const category = await client.channels.fetch(CATEGORY_ID).catch(() => null);
        if (category && category.type === ChannelType.GuildCategory) {
            const guild = category.guild;

            // Fetch all channels in the guild to ensure cache is populated
            await guild.channels.fetch();

            // Get all channels that belong to this category
            const channelsInCategory = guild.channels.cache.filter(c => c.parentId === CATEGORY_ID);

            for (const [id, channel] of channelsInCategory) {
                // Skip the Hub channel itself
                if (id === HUB_CHANNEL_ID) continue;

                // Only handle voice channels
                if (channel.type !== ChannelType.GuildVoice) continue;

                // Check if the channel is empty
                // On startup, we ALWAYS delete empty rooms immediately regardless of cleanup delay
                if (channel.members.size === 0) {
                    console.log(`Deleting empty channel ${channel.name} (${id}) found in category during recovery.`);
                    await channel.delete('Recovery: Channel was empty').catch(err => console.error(`Failed to delete ${id}:`, err));
                    db.removeChannel(id);
                    emptyChannels.delete(id);
                } else {
                    console.log(`Channel ${channel.name} (${id}) is active with ${channel.members.size} members.`);
                }
            }
        }

        // Clean up any remaining database entries for channels that no longer exist
        const savedChannels = db.getAllChannels();
        for (const record of savedChannels) {
            const channel = await client.channels.fetch(record.voice_channel_id).catch(() => null);
            if (!channel) {
                console.log(`Removing non-existent channel ${record.voice_channel_id} from DB.`);
                db.removeChannel(record.voice_channel_id);
            }
        }
    } catch (error) {
        console.error('Error during recovery routine:', error);
    }
    console.log('Recovery routine complete.');
});

// Event: Voice State Update (Joins, Leaves, Moves)
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Get Hub and Category IDs from environment
    const HUB_CHANNEL_ID = process.env.HUB_CHANNEL_ID;
    const CATEGORY_ID = process.env.CATEGORY_ID;

    // Check if a user joined the Hub channel
    // We only trigger if the user was NOT previously in the Hub channel (prevents loops on mute/deafen)
    if (newState.channelId === HUB_CHANNEL_ID && oldState.channelId !== HUB_CHANNEL_ID) {
        try {
            const member = newState.member;
            const guild = newState.guild;

            // Create a new temporary voice channel
            const voiceChannel = await guild.channels.create({
                name: `${member.displayName}'s Room`,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        // Set the creator as the owner.
                        // We do NOT give ManageChannels to enforce the middleware approach via buttons.
                        id: member.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel]
                    }
                ]
            });

            // Move the user into their new channel
            await member.voice.setChannel(voiceChannel);

            // Create the Control Panel Embed
            const controlEmbed = new EmbedBuilder()
                .setTitle('Voice Channel Control Panel')
                .setDescription('Use the buttons below to manage your temporary voice channel.')
                .setColor(0x00AE86)
                .addFields(
                    { name: 'Owner', value: `<@${member.id}>`, inline: true },
                    { name: 'Channel', value: `${voiceChannel.name}`, inline: true }
                );

            // Create buttons for Edit Name, Lock/Unlock, and Set User Limit
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('manage_name')
                        .setLabel('Edit Name')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('manage_limit')
                        .setLabel('Set Limit')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('manage_privacy')
                        .setLabel('Lock/Unlock')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Send the control panel to the voice channel's built-in text chat
            const controlMessage = await voiceChannel.send({
                embeds: [controlEmbed],
                components: [buttons]
            });

            // Pin the control panel message for easy access
            // We wrap this in a try-catch because pinning might fail if permissions are missing
            // or if the channel type doesn't support pinning (though GuildVoice built-in chat does)
            try {
                await controlMessage.pin();
            } catch (pinError) {
                console.warn(`Warning: Could not pin control message in ${voiceChannel.id}. This usually means "Pin Messages" or "Read Message History" permissions are missing.`, pinError.message);
            }

            // Save the channel data to the database
            db.addChannel(voiceChannel.id, member.id, controlMessage.id);

        } catch (error) {
            // Log errors during channel creation with more context
            if (error.code === 50013) {
                console.error(`Error: Bot lacks permissions to create or manage channels in category ${CATEGORY_ID}. Please check "Manage Channels" and "Move Members" permissions.`);
            } else {
                console.error('Error creating temporary channel:', error);
            }
        }
    }

    // Check if a user left a temporary voice channel
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const record = db.getChannel(oldState.channelId);
        if (record) {
            const channel = oldState.channel;
            // If the channel is now empty, start the cleanup timer
            if (channel && channel.members.size === 0) {
                const cleanupDelayMinutes = parseInt(process.env.EMPTY_CHANNEL_CLEANUP_DELAY_MINUTES) || 0;

                if (cleanupDelayMinutes <= 0) {
                    // Immediate cleanup if delay is 0 or less
                    try {
                        await channel.delete('Temporary channel empty');
                        db.removeChannel(oldState.channelId);
                        emptyChannels.delete(oldState.channelId);
                        console.log(`Cleaned up empty channel immediately: ${oldState.channelId}`);
                    } catch (error) {
                        console.error(`Error deleting channel ${oldState.channelId}:`, error);
                    }
                } else {
                    // Mark the time it became empty
                    emptyChannels.set(oldState.channelId, Date.now());
                    console.log(`Channel ${oldState.channelId} is empty. Will clean up in ${cleanupDelayMinutes} minutes.`);
                }
            }
        }
    }

    // Check if a user joined a temporary voice channel that was pending cleanup
    if (newState.channelId && newState.channelId !== oldState.channelId) {
        if (emptyChannels.has(newState.channelId)) {
            emptyChannels.delete(newState.channelId);
            console.log(`User joined ${newState.channelId}. Aborting cleanup timer.`);
        }
    }
});

// Event: Interaction Create (Buttons, Menus, Modals)
client.on('interactionCreate', async (interaction) => {
    // Handle Button and Select Menu interactions
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        // Look up the channel record in the database
        const record = db.getChannel(interaction.channelId);

        // Check if the interaction is happening in a managed channel
        if (!record) return;

        // Verify if the interacting user is the owner of the channel
        if (interaction.user.id !== record.owner_id) {
            return interaction.reply({
                content: 'You do not own this voice channel.',
                ephemeral: true
            });
        }

        const { customId } = interaction;

        // Handle "Edit Name" button click
        if (customId === 'manage_name') {
            // Create a modal for name input
            const modal = new ModalBuilder()
                .setCustomId('modal_name_change')
                .setTitle('Change Channel Name');

            const nameInput = new TextInputBuilder()
                .setCustomId('new_name')
                .setLabel('Enter new channel name:')
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(100)
                .setPlaceholder('My Awesome Room')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(firstActionRow);

            // Show the modal to the user
            await interaction.showModal(modal);
        }

        // Handle "Lock/Unlock" button click (Privacy Toggle)
        if (customId === 'manage_privacy') {
            try {
                const channel = interaction.channel;
                // Get current permission for @everyone role
                const everyoneOverwrites = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);

                // Toggle between Locked (Connect: false) and Public (Connect: null/inherit)
                const isLocked = everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);

                if (isLocked) {
                    // Unlock: Remove Connect denial
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        Connect: null
                    });
                    await interaction.reply({ content: 'Channel is now public.', ephemeral: true });
                } else {
                    // Lock: Set Connect to false
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        Connect: false
                    });
                    await interaction.reply({ content: 'Channel is now locked.', ephemeral: true });
                }
            } catch (error) {
                console.error('Error toggling privacy:', error);
                await interaction.reply({ content: 'Failed to update privacy.', ephemeral: true });
            }
        }

        // Handle "Set User Limit" button click
        if (customId === 'manage_limit') {
            // Create a modal for user limit input
            const modal = new ModalBuilder()
                .setCustomId('modal_limit_change')
                .setTitle('Set User Limit');

            const limitInput = new TextInputBuilder()
                .setCustomId('user_limit')
                .setLabel('Enter limit (0 for unlimited, max 99):')
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(2)
                .setPlaceholder('0')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(limitInput);
            modal.addComponents(firstActionRow);

            // Show the modal to the user
            await interaction.showModal(modal);
        }
    }

    // Handle Modal Submissions
    if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId === 'modal_name_change') {
            // Immediately defer the reply to prevent interaction timeout
            // especially since setName() is subject to strict rate limits
            await interaction.deferReply({ ephemeral: true });

            const newName = interaction.fields.getTextInputValue('new_name');
            try {
                // Update the channel name in Discord
                await interaction.channel.setName(newName);
                // Edit the deferred reply
                await interaction.editReply({ content: `Channel name updated to: ${newName}` });
            } catch (error) {
                console.error('Error updating channel name:', error);
                // Provide specific feedback for rate limits (common with setName)
                const errorMsg = error.code === 50013 ? 'Missing permissions to rename channel.' :
                                error.status === 429 ? 'Rate limited. Please wait a few minutes before renaming again.' :
                                'Failed to update channel name.';

                await interaction.editReply({ content: errorMsg });
            }
        }

        if (interaction.customId === 'modal_limit_change') {
            await interaction.deferReply({ ephemeral: true });
            const limitStr = interaction.fields.getTextInputValue('user_limit');
            const limit = parseInt(limitStr);

            if (isNaN(limit) || limit < 0 || limit > 99) {
                return interaction.editReply({ content: 'Invalid limit. Please enter a number between 0 and 99.' });
            }

            try {
                // Update the voice channel's user limit
                await interaction.channel.setUserLimit(limit);
                await interaction.editReply({ content: `User limit set to ${limit === 0 ? 'unlimited' : limit}.` });
            } catch (error) {
                console.error('Error setting user limit:', error);
                const errorMsg = error.code === 50013 ? 'Missing permissions to set user limit.' : 'Failed to set user limit.';
                await interaction.editReply({ content: errorMsg });
            }
        }
    }
});

// Login to Discord with the provided token
client.login(process.env.DISCORD_TOKEN);
