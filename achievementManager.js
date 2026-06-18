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

/**
 * Checks for and awards achievements.
 * Returns an array of newly earned achievement objects.
 */
async function checkAchievements(userId, session, othersInChannel) {
    const earned = [];

    // Show and Tell check
    if (session.isSharing) {
        const a1 = await awardAchievement(userId, 'show_and_tell');
        if (a1) earned.push(a1);

        // Screen Party check
        const othersSharing = othersInChannel.filter(m => m.isSharing).length;
        if (othersSharing > 0) {
            const a2 = await awardAchievement(userId, 'screen_party');
            if (a2) earned.push(a2);
        }
    }

    // Long Haul check
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
            // Give the reward XP
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

    // Weekly reset check
    if (now.getDay() === weeklyResetDay && (now - lastWeekly > 24 * 60 * 60 * 1000)) {
        // Post leaderboard before reset
        if (process.env.WEEKLY_LEADERBOARD_ENABLED === '1') {
            await postLeaderboard(client, 'weekly', runRenderTask, limiter);
        }
        console.log('Performing weekly reset...');
        db.resetPeriodXP('weekly', now.getTime());
    }

    // Monthly reset check
    if (now.getDate() === monthlyResetDay && (now.getMonth() !== lastMonthly.getMonth() || now.getFullYear() !== lastMonthly.getFullYear())) {
        // Post leaderboard before reset
        if (process.env.MONTHLY_LEADERBOARD_ENABLED === '1') {
            await postLeaderboard(client, 'monthly', runRenderTask, limiter);
        }
        console.log('Performing monthly reset...');
        db.resetPeriodXP('monthly', now.getTime());
    }
}

async function postLeaderboard(client, period, runRenderTask, limiter) {
    // Get specific channel for this period
    const channelId = process.env[`${period.toUpperCase()}_LEADERBOARD_CHANNEL_ID`];
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const top = db.getLeaderboard(period, 10);
    if (top.length === 0) return;

    // Prepare data for rendering
    const entries = [];
    for (const entry of top) {
        const user = await client.users.fetch(entry.user_id).catch(() => ({ username: 'Unknown User' }));
        entries.push({ username: user.username, xp: entry.xp, level: entry.level });
    }

    // Render the Hall of Fame image
    const buffer = await runRenderTask('leaderboard', { period, entries });
    const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });

    // Send via rate limiter
    await limiter.execute(() => channel.send({
        content: `🏆 **${period.toUpperCase()} HALL OF FAME SUMMARY** 🏆`,
        files: [attachment]
    }));
}

module.exports = {
    init,
    checkAchievements,
    awardAchievement,
    checkResets,
    postLeaderboard,
    ACHIEVEMENTS
};
