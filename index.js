/**
 * HubBot - Dynamic Voice Channel Bot
 */

require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionType,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const db = require('./database');
const xpManager = require('./xpManager');
const achievementManager = require('./achievementManager');
const limiter = require('./rateLimiter');
const { Worker } = require('worker_threads');
const path = require('path');
const commands = require('./commands');

const emptyChannels = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

xpManager.init();
achievementManager.init();

/**
 * Offloads Canvas rendering to a worker thread
 */
function runRenderTask(type, data) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'rendererWorker.js'));
        worker.on('message', (msg) => {
            if (msg.status === 'success') resolve(msg.buffer);
            else reject(new Error(msg.error));
            worker.terminate();
        });
        worker.on('error', reject);
        worker.postMessage({ type, data });
    });
}

/**
 * Refreshes the control panel in the voice channel's text chat
 */
async function refreshControlPanel(channel) {
    try {
        const record = db.getChannel(channel.id);
        if (!record || !record.control_message_id) return;

        const message = await limiter.execute(() => channel.messages.fetch(record.control_message_id).catch(() => null));
        if (!message) return;

        const members = [];
        const channelMembersArray = Array.from(channel.members.values());
        for (const member of channelMembersArray) {
            const session = xpManager.userSessions.get(member.id) || { acclimation: 0, isSharing: false };
            members.push({
                name: member.displayName,
                acclimation: session.acclimation,
                isSharing: member.voice.streaming || session.isSharing,
                multiplier: 1.0
            });
        }

        const imageBuffer = await runRenderTask('controlPanel', members);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'status.png' });

        const everyoneOverwrites = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
        const isLocked = everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);
        const isHidden = everyoneOverwrites?.deny.has(PermissionFlagsBits.ViewChannel);

        const updatedEmbed = new EmbedBuilder()
            .setTitle('Voice Channel Control Panel')
            .setColor(isLocked ? 0xff4742 : 0x00AE86)
            .addFields(
                { name: 'Privacy', value: isLocked ? '🔒 Locked' : '🔓 Public', inline: true },
                { name: 'Visibility', value: isHidden ? '👻 Hidden' : '👁️ Visible', inline: true }
            )
            .setImage('attachment://status.png')
            .setTimestamp();

        await limiter.execute(() => message.edit({ embeds: [updatedEmbed], files: [attachment] }));

    } catch (error) {
        console.error(`Error refreshing control panel for ${channel.id}:`, error);
    }
}

/**
 * Sends a notification to the central BOT_OUTPUT_CHANNEL_ID feed
 */
async function sendToActivityFeed(embed) {
    const outputChannelId = process.env.BOT_OUTPUT_CHANNEL_ID;
    if (outputChannelId) {
        const channel = await client.channels.fetch(outputChannelId).catch(() => null);
        if (channel) {
            await limiter.execute(() => channel.send({ embeds: [embed] }));
        }
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await client.application.commands.set(commands.commands);

    // Main 10-second loop for XP, Acclimation, and Feed updates
    setInterval(async () => {
        try {
            const oldLevels = new Map();
            for (const [userId, session] of xpManager.userSessions) {
                if (!session.leaveTimestamp) {
                    const user = db.getUser(userId);
                    oldLevels.set(userId, user.level);
                }
            }

            await xpManager.tick(client, limiter);

            for (const [userId, session] of xpManager.userSessions) {
                if (session.leaveTimestamp) continue;

                const user = db.getUser(userId);
                const othersInChannel = Array.from(xpManager.userSessions.values())
                    .filter(s => s.channelId === session.channelId && s.userId !== userId && !s.leaveTimestamp);

                // 1. Check Achievements
                const earnedAchs = await achievementManager.checkAchievements(userId, session, othersInChannel);
                for (const ach of earnedAchs) {
                    const achEmbed = new EmbedBuilder()
                        .setTitle('🏆 Achievement Unlocked!')
                        .setDescription(`<@${userId}> earned the **${ach.name}** achievement!\n*${ach.description}*`)
                        .setColor(0x00AE86)
                        .setTimestamp();
                    await sendToActivityFeed(achEmbed);
                }

                // 2. Check Level Up
                if (user.level > (oldLevels.get(userId) || 0)) {
                    await achievementManager.awardAchievement(userId, 'buffer_overflow');

                    const lvlEmbed = new EmbedBuilder()
                        .setTitle('🎊 Level Up!')
                        .setDescription(`Congratulations <@${userId}>! You've reached **Level ${user.level}**!`)
                        .setColor(0xFFD700)
                        .setTimestamp();

                    await sendToActivityFeed(lvlEmbed);

                    const vc = await client.channels.fetch(session.channelId).catch(() => null);
                    if (vc) await limiter.execute(() => vc.send({ embeds: [lvlEmbed] }).catch(() => {}));
                }
            }

            // Update all pinned control panels
            const activeChannels = db.getAllChannels();
            for (const record of activeChannels) {
                const channel = await client.channels.fetch(record.voice_channel_id).catch(() => null);
                if (channel) {
                    await refreshControlPanel(channel);
                }
            }

            // Handle weekly/monthly resets and leaderboard posts
            await achievementManager.checkResets(client, runRenderTask, limiter);

            // Channel Cleanup
            const now = Date.now();
            const cleanupDelayMs = (parseInt(process.env.EMPTY_CHANNEL_CLEANUP_DELAY_MINUTES) || 0) * 60 * 1000;
            for (const [channelId, emptySince] of emptyChannels) {
                if (now - emptySince >= cleanupDelayMs) {
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        await limiter.execute(() => channel.delete('Empty cleanup delay expired'));
                    }
                    db.removeChannel(channelId);
                    emptyChannels.delete(channelId);
                }
            }

        } catch (error) {
            console.error('Error in main loop:', error);
        }
    }, 10000);

    // Startup Recovery Logic
    const CATEGORY_ID = process.env.CATEGORY_ID;
    const HUB_CHANNEL_ID = process.env.HUB_CHANNEL_ID;

    try {
        const category = await client.channels.fetch(CATEGORY_ID).catch(() => null);
        if (category && category.type === ChannelType.GuildCategory) {
            const guild = category.guild;
            await guild.channels.fetch();
            const channelsInCategory = guild.channels.cache.filter(c => c.parentId === CATEGORY_ID);

            for (const [id, channel] of channelsInCategory) {
                if (id === HUB_CHANNEL_ID) continue;
                // Important: Only clean up voice channels. Text channels are safe.
                if (channel.type !== ChannelType.GuildVoice) continue;

                if (channel.members.size === 0) {
                    await limiter.execute(() => channel.delete('Recovery: Channel empty'));
                    db.removeChannel(id);
                } else {
                    for (const [memberId, member] of channel.members) {
                        xpManager.updateUserPresence(memberId, id, member.voice.streaming);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error during startup recovery:', error);
    }
});

/**
 * Handle Voice State Updates
 */
client.on('voiceStateUpdate', async (oldState, newState) => {
    const HUB_CHANNEL_ID = process.env.HUB_CHANNEL_ID;
    const CATEGORY_ID = process.env.CATEGORY_ID;

    if (newState.channelId === HUB_CHANNEL_ID && oldState.channelId !== HUB_CHANNEL_ID) {
        try {
            const member = newState.member;
            const voiceChannel = await limiter.execute(() => newState.guild.channels.create({
                name: `${member.displayName}'s Room`,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID
            }));

            await limiter.execute(() => member.voice.setChannel(voiceChannel));

            const controlEmbed = new EmbedBuilder()
                .setTitle('Voice Channel Control Panel')
                .setDescription('Use the buttons below to manage your channel.')
                .setColor(0x00AE86);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manage_name').setLabel('Edit Name').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('manage_limit').setLabel('Set Limit').setStyle(ButtonStyle.Primary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manage_privacy').setLabel('Lock/Unlock').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('manage_visibility').setLabel('Hide/Show').setStyle(ButtonStyle.Secondary)
            );

            const controlMessage = await limiter.execute(() => voiceChannel.send({
                embeds: [controlEmbed],
                components: [row1, row2]
            }));

            try { await limiter.execute(() => controlMessage.pin()); } catch (e) {}
            db.addChannel(voiceChannel.id, member.id, controlMessage.id);
            xpManager.updateUserPresence(member.id, voiceChannel.id, false);
        } catch (error) {
            console.error('Error in voice room creation:', error);
        }
    }

    if (newState.channelId && newState.channelId !== HUB_CHANNEL_ID && newState.channelId !== newState.guild.afkChannelId) {
        xpManager.updateUserPresence(newState.id, newState.channelId, newState.streaming);
        if (emptyChannels.has(newState.channelId)) emptyChannels.delete(newState.channelId);
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        xpManager.handleUserLeave(oldState.id);
        const record = db.getChannel(oldState.channelId);
        if (record) {
            const channel = oldState.channel;
            if (channel && channel.members.size === 0) {
                emptyChannels.set(oldState.channelId, Date.now());
            }
        }
    }
});

/**
 * Handle Interactions (Buttons, Modals, Slash Commands)
 */
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        await commands.handleInteraction(interaction, runRenderTask);
        return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.type === InteractionType.ModalSubmit) {
        const record = db.getChannel(interaction.channelId);
        if (!record) return;

        const channel = interaction.channel;
        const member = channel.members.get(interaction.user.id);
        if (!member) return interaction.reply({ content: 'You must be in the voice channel to use the controls.', ephemeral: true });

        const { customId } = interaction;

        if (customId === 'manage_name') {
            const modal = new ModalBuilder().setCustomId('modal_name_change').setTitle('Change Channel Name');
            const nameInput = new TextInputBuilder().setCustomId('new_name').setLabel('Enter new name:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            await interaction.showModal(modal);
        }

        if (customId === 'manage_privacy') {
            const everyoneOverwrites = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
            const isLocked = everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);
            await limiter.execute(() => channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: isLocked ? null : false }));
            await interaction.reply({ content: `${isLocked ? '🔓' : '🔒'} ${interaction.member.displayName} ${isLocked ? 'unlocked' : 'locked'} the channel.` });
            await refreshControlPanel(channel);
        }

        if (customId === 'manage_visibility') {
            const everyoneOverwrites = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
            const isHidden = everyoneOverwrites?.deny.has(PermissionFlagsBits.ViewChannel);
            await limiter.execute(() => channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: isHidden ? null : false }));
            await interaction.reply({ content: `${isHidden ? '👁️' : '👻'} ${interaction.member.displayName} ${isHidden ? 'showed' : 'hid'} the channel.` });
            await refreshControlPanel(channel);
        }

        if (customId === 'manage_limit') {
            const modal = new ModalBuilder().setCustomId('modal_limit_change').setTitle('Set User Limit');
            const limitInput = new TextInputBuilder().setCustomId('user_limit').setLabel('Enter limit (0-99):').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
            await interaction.showModal(modal);
        }

        if (interaction.type === InteractionType.ModalSubmit) {
            if (interaction.customId === 'modal_name_change') {
                await interaction.deferReply();
                const newName = interaction.fields.getTextInputValue('new_name');
                await limiter.execute(() => interaction.channel.setName(newName));
                await interaction.editReply({ content: `📝 ${interaction.member.displayName} renamed the room to: **${newName}**` });
                await refreshControlPanel(interaction.channel);
            }
            if (interaction.customId === 'modal_limit_change') {
                await interaction.deferReply({ ephemeral: true });
                const limit = parseInt(interaction.fields.getTextInputValue('user_limit'));
                if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: 'Invalid limit. Use 0-99.' });
                await limiter.execute(() => interaction.channel.setUserLimit(limit));
                await interaction.editReply({ content: `👥 ${interaction.member.displayName} set user limit to **${limit}**.` });
                await refreshControlPanel(interaction.channel);
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
