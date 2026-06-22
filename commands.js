/**
 * commands.js
 * Definitions and handlers for slash commands.
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('./database');
const xpManager = require('./xpManager');
const achievementManager = require('./achievementManager');

const commands = [
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show your or another users level and achievements.')
        .addUserOption(option => option.setName('target').setDescription('The user to check')),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the XP leaderboard for this channel.'),

    new SlashCommandBuilder()
        .setName('givexp')
        .setDescription('Grant XP to a user (Admins only)')
        .addUserOption(option => option.setName('target').setDescription('The user').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of XP').setRequired(true))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('The period to add to')
                .addChoices(
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Lifetime', value: 'lifetime' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('giveachievement')
        .setDescription('Grant an achievement to a user (Admins only)')
        .addUserOption(option => option.setName('target').setDescription('The user').setRequired(true))
        .addStringOption(option =>
            option.setName('achievement')
                .setDescription('The achievement ID')
                .setRequired(true)
                .addChoices(
                    ...achievementManager.ACHIEVEMENTS.map(a => ({ name: a.name, value: a.id }))
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName('resetuser')
        .setDescription('Reset a users stats (Admins only)')
        .addUserOption(option => option.setName('target').setDescription('The user').setRequired(true))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('The period to reset')
                .addChoices(
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Lifetime', value: 'lifetime' },
                    { name: 'All', value: 'all' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function handleInteraction(interaction, runRenderTask) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'stats') {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;
        const userRecord = db.getUser(target.id);
        const achs = db.getUserAchievements(target.id);

        // Implement "Shortest Term Level" logic: Weekly > Monthly > Lifetime.
        // We use the first period that has a non-zero level.
        const period = userRecord.weekly_level > 0 ? 'weekly' : (userRecord.monthly_level > 0 ? 'monthly' : 'lifetime');

        // Extract the level and current XP for the chosen period.
        const displayLevel = period === 'weekly' ? userRecord.weekly_level : (period === 'monthly' ? userRecord.monthly_level : userRecord.level);
        const displayXP = period === 'weekly' ? userRecord.weekly_xp : (period === 'monthly' ? userRecord.monthly_xp : userRecord.xp);

        // Calculate XP progress to the next level for the selected period.
        const currentXPForLevel = xpManager.getXPForLevel(displayLevel);
        const nextXPForLevel = xpManager.getXPForLevel(displayLevel + 1);
        const xpProgress = (displayXP - currentXPForLevel) / (nextXPForLevel - currentXPForLevel);

        // Prepare data for the stats card renderer.
        const cardData = {
            username: target.username,
            level: displayLevel,
            period: period.charAt(0).toUpperCase() + period.slice(1), // Label like 'Weekly' or 'Lifetime'
            currentXP: Math.floor(displayXP),
            neededXP: nextXPForLevel,
            xpProgress: Math.max(0, Math.min(1, xpProgress)),
            weeklyXP: Math.floor(userRecord.weekly_xp),
            monthlyXP: Math.floor(userRecord.monthly_xp),
            achievementsCount: achs.length
        };

        try {
            const buffer = await runRenderTask('statsCard', cardData);
            // Explicitly wrap in Buffer.from for Discord.js v14
            const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: 'stats.png' });
            await interaction.editReply({ files: [attachment] });
        } catch (error) {
            console.error('Stats rendering failed:', error);
            await interaction.editReply({ content: 'Failed to render stats card.' });
        }
    }

    if (commandName === 'leaderboard') {
        const channelId = interaction.channelId;
        let period = null;

        // Determine period based on channel ID
        if (channelId === process.env.WEEKLY_LEADERBOARD_CHANNEL_ID) period = 'weekly';
        else if (channelId === process.env.MONTHLY_LEADERBOARD_CHANNEL_ID) period = 'monthly';
        else if (channelId === process.env.LIFETIME_LEADERBOARD_CHANNEL_ID) period = 'lifetime';

        if (!period) {
            return interaction.reply({
                content: 'This command can only be used in designated leaderboard channels.',
                ephemeral: true
            });
        }

        const top = db.getLeaderboard(period, 10);
        let description = top.map((entry, i) => `${i+1}. <@${entry.user_id}> - Level ${entry.level} (${Math.floor(entry.xp).toLocaleString()} XP)`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`${period.charAt(0).toUpperCase() + period.slice(1)} Leaderboard`)
            .setDescription(description || 'No entries yet.')
            .setColor(period === 'weekly' ? 0x7289da : (period === 'monthly' ? 0xff73fa : 0xFFD700));

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'givexp' || commandName === 'giveachievement' || commandName === 'resetuser') {
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        if (adminRoleId && !interaction.member.roles.cache.has(adminRoleId)) {
            return interaction.reply({ content: 'Missing required admin role.', ephemeral: true });
        }

        const target = interaction.options.getUser('target');

        if (commandName === 'givexp') {
            const amount = interaction.options.getInteger('amount');
            const period = interaction.options.getString('period') || 'lifetime';
            const maxGrant = parseInt(process.env.MAX_MANUAL_XP_GRANT) || 10000;
            if (amount > maxGrant) return interaction.reply({ content: 'Grant exceeds limit.', ephemeral: true });

            const user = db.getUser(target.id);
            const current = (period === 'weekly' ? user.weekly_xp : (period === 'monthly' ? user.monthly_xp : user.xp));
            db.setUserXP(target.id, current + amount, period);
            await interaction.reply({ content: `Gave ${amount.toLocaleString()} XP to <@${target.id}>.` });
        }

        if (commandName === 'giveachievement') {
            const achId = interaction.options.getString('achievement');
            await achievementManager.awardAchievement(target.id, achId);
            await interaction.reply({ content: `Awarded **${achId}** to <@${target.id}>.` });
        }

        if (commandName === 'resetuser') {
            const period = interaction.options.getString('period') || 'all';
            if (period === 'weekly' || period === 'all') db.setUserXP(target.id, 0, 'weekly');
            if (period === 'monthly' || period === 'all') db.setUserXP(target.id, 0, 'monthly');
            if (period === 'lifetime' || period === 'all') db.setUserXP(target.id, 0, 'lifetime');
            await interaction.reply({ content: `Reset ${period} stats for <@${target.id}>.` });
        }
    }
}

module.exports = {
    commands,
    handleInteraction
};
