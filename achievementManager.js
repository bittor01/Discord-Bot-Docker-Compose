/**
 * achievementManager.js
 * Handles achievement detection, awarding, and periodic resets.
 */

const db = require('./database');
const xpManager = require('./xpManager');
const { AttachmentBuilder } = require('discord.js');

const ACHIEVEMENTS = [
    { id: 'show_and_tell', name: 'Show and Tell', description: 'Share your screen in a voice channel.', icon: 'f083', xp_reward: 500, type: 'lifetime' },
    { id: 'screen_party', name: 'Screen Party', description: 'Share your screen while at least one other person is also sharing.', icon: 'f0c0', xp_reward: 1000, type: 'lifetime' },
    { id: 'long_haul', name: 'Long Haul', description: 'Spend 2 hours in a single session without your acclimation reaching 0.', icon: 'f017', xp_reward: 2000, type: 'lifetime' },
    { id: 'buffer_overflow', name: 'Buffer Overflow', description: 'Gain a level!', icon: 'f0e7', xp_reward: 100, type: 'lifetime' }
];

function init() {
    for (const ach of ACHIEVEMENTS) {
        db.addAchievementDef(ach.id, ach.name, ach.description, ach.icon, ach.xp_reward, ach.type);
    }
}

async function checkAchievements(userId, session, othersInChannel) {
    const earned = [];
    if (session.isSharing) {
        const a1 = await awardAchievement(userId, 'show_and_tell');
        if (a1) earned.push(a1);
        const othersSharing = othersInChannel.filter(m => m.isSharing).length;
        if (othersSharing > 0) {
            const a2 = await awardAchievement(userId, 'screen_party');
            if (a2) earned.push(a2);
        }
    }
    if (!session.leaveTimestamp && session.sessionStartTimestamp) {
        if (Date.now() - session.sessionStartTimestamp >= 2 * 60 * 60 * 1000) {
            const a3 = await awardAchievement(userId, 'long_haul');
            if (a3) earned.push(a3);
        }
    }
    return earned;
}

async function awardAchievement(userId, achievementId, periodKey = 'lifetime') {
    const success = db.giveAchievement(userId, achievementId, periodKey);
    if (success.changes > 0) {
        console.log(`User ${userId} earned achievement: ${achievementId}`);
        const ach = ACHIEVEMENTS.find(a => a.id === achievementId);
        if (ach && ach.xp_reward > 0) {
            xpManager.awardXP(userId, ach.xp_reward);
        }
        return ach;
    }
    return null;
}

async function checkResets(client, runRenderTask, limiter) {
    const now = new Date();
    const globalState = db.getGlobalState();
    const lastWeekly = new Date(globalState.last_weekly || 0);
    const lastMonthly = new Date(globalState.last_monthly || 0);
    const weeklyResetDay = parseInt(process.env.WEEKLY_RESET_DAY) || 0;
    const monthlyResetDay = parseInt(process.env.MONTHLY_RESET_DAY) || 1;

    if (now.getDay() === weeklyResetDay && (now - lastWeekly > 24 * 60 * 60 * 1000)) {
        if (process.env.WEEKLY_LEADERBOARD_ENABLED === '1') {
            await postAndPinLeaderboard(client, 'weekly', runRenderTask, limiter);
        }
        console.log('Performing weekly reset...');
        db.resetPeriodXP('weekly', now.getTime());
    }
    if (now.getDate() === monthlyResetDay && (now.getMonth() !== lastMonthly.getMonth() || now.getFullYear() !== lastMonthly.getFullYear())) {
        if (process.env.MONTHLY_LEADERBOARD_ENABLED === '1') {
            await postAndPinLeaderboard(client, 'monthly', runRenderTask, limiter);
        }
        console.log('Performing monthly reset...');
        db.resetPeriodXP('monthly', now.getTime());
    }
}

async function postAndPinLeaderboard(client, period, runRenderTask, limiter) {
    const channelId = process.env[`${period.toUpperCase()}_LEADERBOARD_CHANNEL_ID`];
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const top = db.getLeaderboard(period, 10);
    if (top.length === 0) return;

    const entries = [];
    for (const entry of top) {
        // Attempt to fetch the member from the guild to get their server-specific nickname.
        const member = await channel.guild.members.fetch(entry.user_id).catch(() => null);
        // Fallback: If not in the server, fetch their global user object.
        const user = !member ? await client.users.fetch(entry.user_id).catch(() => ({ username: 'Unknown User' })) : null;

        // Use the nickname (displayName) if available, otherwise the username.
        const displayName = member ? member.displayName : (user ? user.username : 'Unknown User');

        entries.push({ username: displayName, xp: entry.xp, level: entry.level });
    }

    const buffer = await runRenderTask('leaderboard', { period, entries });
    // Explicitly wrap in Buffer.from to ensure compatibility with Discord.js v14
    const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: 'leaderboard.png' });

    const message = await limiter.execute(() => channel.send({
        content: `🏆 **${period.toUpperCase()} HALL OF FAME** 🏆`,
        files: [attachment]
    }));

    try {
        // Unpin previous leaderboard messages
        const pinned = await limiter.execute(() => channel.messages.fetchPinned());
        for (const msg of pinned.values()) {
            if (msg.author.id === client.user.id && msg.content.includes('HALL OF FAME')) {
                await limiter.execute(() => msg.unpin());
            }
        }
        // Pin the new one
        await limiter.execute(() => message.pin());
    } catch (err) {
        console.error(`Failed to manage pins in ${channelId}:`, err);
    }
}

module.exports = {
    init,
    checkAchievements,
    awardAchievement,
    checkResets,
    ACHIEVEMENTS
};
