/**
 * index.js
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
    TextInputStyle,
    Events
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

async function refreshControlPanel(channel) {
    try {
        const record = db.getChannel(channel.id);
        if (!record || !record.control_message_id) return;

        const message = await limiter.execute(() => channel.messages.fetch(record.control_message_id).catch(() => null));
        if (!message) return;

        // 1. Gather session and presence data for all members currently in the VC.
        const membersData = [];
        const channelMembersArray = Array.from(channel.members.values());
        for (const member of channelMembersArray) {
            // Retrieve their session (or create a temporary one if not yet tracked)
            const session = xpManager.userSessions.get(member.id) || {
                acclimation: 0,
                isSharing: false,
                sessionStartTimestamp: Date.now()
            };
            membersData.push({
                userId: member.id,
                name: member.displayName,
                acclimation: session.acclimation,
                isSharing: member.voice.streaming || session.isSharing,
                sessionStartTimestamp: session.sessionStartTimestamp,
                channelId: channel.id
            });
        }

        // 2. Sort members by "Seniority" (King of the Hill logic).
        // Earliest joiners (lowest timestamp) appear at the top of the list.
        membersData.sort((a, b) => a.sessionStartTimestamp - b.sessionStartTimestamp);

        // 3. Calculate real-time XP multipliers and gather levels for each member to display in the UI.
        const renderedMembers = [];
        for (const mData of membersData) {
            // Optimization: Since we already have the 'channel' object with its 'members' cache,
            // we pass the GuildMember object directly to avoid redundant API calls.
            const guildMember = channel.members.get(mData.userId);
            const mult = await xpManager.calculateMultiplier(client, mData.userId, membersData, limiter, guildMember);

            // Fetch the user's levels from the database.
            const user = db.getUser(mData.userId) || { level: 0, weekly_level: 0, monthly_level: 0, xp: 0, weekly_xp: 0, monthly_xp: 0 };

            // Logic for "shortest term level": Weekly > Monthly > Lifetime.
            // If weekly level is enabled (non-zero), use it. Otherwise try monthly, then lifetime.
            const p = user.weekly_level > 0 ? 'weekly' : (user.monthly_level > 0 ? 'monthly' : 'lifetime');
            const displayLevel = p === 'weekly' ? user.weekly_level : (p === 'monthly' ? user.monthly_level : user.level);
            const currentXP = p === 'weekly' ? user.weekly_xp : (p === 'monthly' ? user.monthly_xp : user.xp);

            // Calculate progress to next level
            const xpForCurrentLevel = xpManager.getXPForLevel(displayLevel);
            const xpForNextLevel = xpManager.getXPForLevel(displayLevel + 1);
            const progress = (currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel);

            // Calculate "Time to Level" (TTL)
            // XP_PER_SECOND is the base rate. We multiply by our real-time total multiplier.
            const xpPerSec = parseFloat(process.env.XP_PER_SECOND) || 1;
            const xpRemaining = xpForNextLevel - currentXP;
            let eta = 'N/A';
            if (mult > 0) {
                const secondsRemaining = xpRemaining / (xpPerSec * mult);
                const minutesRemaining = Math.ceil(secondsRemaining / 60);
                if (minutesRemaining >= 60) {
                    const hours = Math.floor(minutesRemaining / 60);
                    const mins = minutesRemaining % 60;
                    eta = `${hours}h ${mins}m`;
                } else {
                    eta = `${minutesRemaining}m`;
                }
            }

            renderedMembers.push({
                name: mData.name,
                progress: Math.min(1.0, Math.max(0, progress)),
                isSharing: mData.isSharing,
                eta,
                level: displayLevel
            });
        }

        // 4. Generate the control panel image with sorted members and accurate multipliers.
        const imageBuffer = await runRenderTask('controlPanel', renderedMembers);
        // Explicitly wrap in Buffer.from to fix ReqResourceType error
        const attachment = new AttachmentBuilder(Buffer.from(imageBuffer), { name: 'status.png' });

        const everyoneOverwrites = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
        const isLocked = !!everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);
        const isHidden = !!everyoneOverwrites?.deny.has(PermissionFlagsBits.ViewChannel);

        const updatedEmbed = new EmbedBuilder()
            .setTitle('Voice Channel Control Panel')
            .setColor(isLocked ? 0xff4742 : 0x00AE86)
            .addFields(
                { name: 'Room Access', value: isLocked ? '🔒 Locked' : '🔓 Open', inline: true },
                { name: 'Discovery', value: isHidden ? '👻 Private' : '🌍 Public', inline: true }
            )
            .setImage('attachment://status.png')
            .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('manage_name').setLabel('Edit Name').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('manage_limit').setLabel('Set Limit').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('manage_privacy').setLabel(isLocked ? 'Unlock' : 'Lock').setStyle(isLocked ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('manage_visibility').setLabel(isHidden ? 'Public' : 'Private').setStyle(isHidden ? ButtonStyle.Success : ButtonStyle.Secondary)
        );

        await limiter.execute(() => message.edit({ embeds: [updatedEmbed], files: [attachment], components: [row1, row2] }));

    } catch (error) {
        console.error(`Error refreshing control panel for ${channel.id}:`, error);
    }
}

async function sendNotification(period, embed) {
    const channelId = process.env[`${period.toUpperCase()}_LEADERBOARD_CHANNEL_ID`];
    if (channelId) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
            await limiter.execute(() => channel.send({ embeds: [embed] }));
        }
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await client.application.commands.set(commands.commands);

    setInterval(async () => {
        try {
            const oldLevels = new Map();
            for (const [userId, session] of xpManager.userSessions) {
                if (!session.leaveTimestamp) {
                    const user = db.getUser(userId);
                    oldLevels.set(userId, {
                        lifetime: user.level,
                        weekly: user.weekly_level,
                        monthly: user.monthly_level
                    });
                }
            }

            await xpManager.tick(client, limiter);

            for (const [userId, session] of xpManager.userSessions) {
                if (session.leaveTimestamp) continue;

                const user = db.getUser(userId);
                const old = oldLevels.get(userId) || { lifetime: 0, weekly: 0, monthly: 0 };

                const othersInChannel = Array.from(xpManager.userSessions.values())
                    .filter(s => s.channelId === session.channelId && s.userId !== userId && !s.leaveTimestamp);

                const earnedAchs = await achievementManager.checkAchievements(userId, session, othersInChannel);
                for (const ach of earnedAchs) {
                    const achEmbed = new EmbedBuilder()
                        .setTitle('🏆 Achievement Unlocked!')
                        .setDescription(`<@${userId}> earned the **${ach.name}** achievement!\n*${ach.description}*`)
                        .setColor(0x00AE86)
                        .setTimestamp();
                    await sendNotification(ach.type || 'lifetime', achEmbed);
                }

                const periods = ['lifetime', 'weekly', 'monthly'];
                for (const p of periods) {
                    const currentLevel = p === 'lifetime' ? user.level : (p === 'weekly' ? user.weekly_level : user.monthly_level);
                    if (currentLevel > old[p]) {
                        if (p === 'lifetime') await achievementManager.awardAchievement(userId, 'buffer_overflow');

                        const lvlEmbed = new EmbedBuilder()
                            .setTitle(`🎊 ${p.charAt(0).toUpperCase() + p.slice(1)} Level Up!`)
                            .setDescription(`Congratulations <@${userId}>! You've reached **${p} Level ${currentLevel}**!`)
                            .setColor(p === 'weekly' ? 0x7289da : (p === 'monthly' ? 0xff73fa : 0xFFD700))
                            .setTimestamp();

                        await sendNotification(p, lvlEmbed);

                        if (p === 'lifetime') {
                            const vc = await client.channels.fetch(session.channelId).catch(() => null);
                            if (vc) await limiter.execute(() => vc.send({ embeds: [lvlEmbed] }).catch(() => {}));
                        }
                    }
                }
            }

            const activeChannels = db.getAllChannels();
            for (const record of activeChannels) {
                const channel = await client.channels.fetch(record.voice_channel_id).catch(() => null);
                if (channel) {
                    await refreshControlPanel(channel);
                }
            }

            await achievementManager.checkResets(client, runRenderTask, limiter);

            const now = Date.now();
            const cleanupDelayMs = (parseInt(process.env.EMPTY_CHANNEL_CLEANUP_DELAY_MINUTES) || 0) * 60 * 1000;
            for (const [channelId, emptySince] of emptyChannels) {
                if (now - emptySince >= cleanupDelayMs) {
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        await limiter.execute(() => channel.delete('Empty cleanup'));
                    }
                    db.removeChannel(channelId);
                    emptyChannels.delete(channelId);
                }
            }

        } catch (error) {
            console.error('Error in main loop:', error);
        }
    }, 10000);

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
                if (channel.type !== ChannelType.GuildVoice) continue;
                if (channel.members.size === 0) {
                    await limiter.execute(() => channel.delete('Recovery'));
                    db.removeChannel(id);
                } else {
                    for (const [memberId, member] of channel.members) {
                        xpManager.updateUserPresence(memberId, id, member.voice.streaming);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in recovery:', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const HUB_CHANNEL_ID = process.env.HUB_CHANNEL_ID;
    const CATEGORY_ID = process.env.CATEGORY_ID;
    if (newState.channelId === HUB_CHANNEL_ID && oldState.channelId !== HUB_CHANNEL_ID) {
        try {
            const member = newState.member;
            const voiceChannel = await limiter.execute(() => newState.guild.channels.create({
                name: `${member.displayName}'s Room`,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: newState.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            }));
            await limiter.execute(() => member.voice.setChannel(voiceChannel));
            const controlEmbed = new EmbedBuilder().setTitle('Voice Channel Control Panel').setDescription('Manage your channel below.').setColor(0x00AE86);
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manage_name').setLabel('Edit Name').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('manage_limit').setLabel('Set Limit').setStyle(ButtonStyle.Primary)
            );
            // Default to 'Lock' and 'Hide' since rooms are public/visible by default
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manage_privacy').setLabel('Lock').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('manage_visibility').setLabel('Hide').setStyle(ButtonStyle.Secondary)
            );
            const controlMessage = await limiter.execute(() => voiceChannel.send({ embeds: [controlEmbed], components: [row1, row2] }));
            try { await limiter.execute(() => controlMessage.pin()); } catch (e) {}
            db.addChannel(voiceChannel.id, member.id, controlMessage.id);
            xpManager.updateUserPresence(member.id, voiceChannel.id, false);
        } catch (error) {
            console.error('Error creating voice room:', error);
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
        if (!member) return interaction.reply({ content: 'You must be in the voice channel.', ephemeral: true });
        const { customId } = interaction;
        if (customId === 'manage_name') {
            const modal = new ModalBuilder().setCustomId('modal_name_change').setTitle('Change Channel Name');
            const nameInput = new TextInputBuilder().setCustomId('new_name').setLabel('Enter new name:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            await interaction.showModal(modal);
        }
        if (customId === 'manage_privacy') {
            try {
                const everyoneOverwrites = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
                const isLocked = !!everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);

                if (!isLocked) {
                    // LOCKING: Grant explicit Connect to everyone currently in the channel
                    const memberIds = Array.from(channel.members.keys());
                    for (const mId of memberIds) {
                        await limiter.execute(() => channel.permissionOverwrites.edit(mId, { Connect: true }));
                    }
                    // Then deny for everyone else
                    await limiter.execute(() => channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false }));
                } else {
                    // UNLOCKING: Remove all explicit member overwrites for Connect
                    const overwrites = Array.from(channel.permissionOverwrites.cache.values());
                    for (const over of overwrites) {
                        // Only remove user-specific overwrites, don't touch @everyone or role-based ones
                        if (over.type === 1) { // 1 = Member
                            await limiter.execute(() => channel.permissionOverwrites.delete(over.id));
                        }
                    }
                    // Then clear the everyone deny
                    await limiter.execute(() => channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null }));
                }

                await interaction.reply({ content: `${isLocked ? '🔓' : '🔒'} ${interaction.member.displayName} **${isLocked ? 'Unlocked' : 'Locked'}** the channel.` });
                await refreshControlPanel(channel);
            } catch (err) {
                console.error('Error toggling privacy:', err);
                const content = err.code === 50013 ? '❌ I do not have permission to change channel permissions.' : '❌ An error occurred.';
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
        if (customId === 'manage_visibility') {
            try {
                const everyoneOverwrites = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
                const isHidden = everyoneOverwrites?.deny.has(PermissionFlagsBits.ViewChannel);
                // Toggle both visibility AND connect for @everyone when making public
                await limiter.execute(() => channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    ViewChannel: isHidden ? null : false,
                    Connect: isHidden ? null : false
                }));
                await interaction.reply({ content: `🌍 ${interaction.member.displayName} made the channel **${isHidden ? 'Public' : 'Private'}**.` });
                await refreshControlPanel(channel);
            } catch (err) {
                console.error('Error toggling visibility:', err);
                const content = err.code === 50013 ? '❌ I do not have permission to change channel permissions.' : '❌ An error occurred.';
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
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
                await interaction.editReply({ content: `📝 Renamed to: **${newName}**` });
                await refreshControlPanel(interaction.channel);
            }
            if (interaction.customId === 'modal_limit_change') {
                await interaction.deferReply({ ephemeral: true });
                const limit = parseInt(interaction.fields.getTextInputValue('user_limit'));
                if (isNaN(limit) || limit < 0 || limit > 99) return interaction.editReply({ content: 'Invalid limit.' });
                await limiter.execute(() => interaction.channel.setUserLimit(limit));
                await interaction.editReply({ content: `👥 Limit set to ${limit}.` });
                await refreshControlPanel(interaction.channel);
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
