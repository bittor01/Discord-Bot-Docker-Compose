/**
 * achievementManager.js
 * Handles achievement detection, awarding, and periodic resets.
 */

const db = require('./database');
const xpManager = require('./xpManager');

const ACHIEVEMENTS = [
    {
        id: 'show_and_tell',
        name: 'Show and Tell',
        description: 'Share your screen in a voice channel.',
        icon: 'f083',
        xp_reward: 500,
        type: 'lifetime'
    },
    {
        id: 'screen_party',
        name: 'Screen Party',
        description: 'Share your screen while at least one other person is also sharing.',
        icon: 'f0c0',
        xp_reward: 1000,
        type: 'lifetime'
    },
    {
        id: 'long_haul',
        name: 'Long Haul',
        description: 'Spend 2 hours in a single session without your acclimation reaching 0.',
        icon: 'f017',
        xp_reward: 2000,
        type: 'lifetime'
    },
    {
        id: 'buffer_overflow',
        name: 'Buffer Overflow',
        description: 'Gain a level!',
        icon: 'f0e7',
        xp_reward: 100,
        type: 'lifetime'
    }
];

function init() {
    for (const ach of ACHIEVEMENTS) {
        db.addAchievementDef(ach.id, ach.name, ach.description, ach.icon, ach.xp_reward, ach.type);
    }
}

async function checkAchievements(userId, session, othersInChannel) {
    if (session.isSharing) {
        await awardAchievement(userId, 'show_and_tell');
        const othersSharing = othersInChannel.filter(m => m.isSharing).length;
        if (othersSharing > 0) {
            await awardAchievement(userId, 'screen_party');
        }
    }

    if (!session.leaveTimestamp && session.sessionStartTimestamp) {
        if (Date.now() - session.sessionStartTimestamp >= 2 * 60 * 60 * 1000) {
            await awardAchievement(userId, 'long_haul');
        }
    }
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

function checkResets() {
    const now = new Date();
    const globalState = db.getGlobalState();
    const lastWeekly = new Date(globalState.last_weekly || 0);
    const lastMonthly = new Date(globalState.last_monthly || 0);

    const weeklyResetDay = parseInt(process.env.WEEKLY_RESET_DAY) || 0;
    const monthlyResetDay = parseInt(process.env.MONTHLY_RESET_DAY) || 1;

    // Weekly reset check
    if (now.getDay() === weeklyResetDay && (now - lastWeekly > 24 * 60 * 60 * 1000)) {
        console.log('Performing weekly reset...');
        db.resetPeriodXP('weekly', now.getTime());
    }

    // Monthly reset check
    if (now.getDate() === monthlyResetDay && (now.getMonth() !== lastMonthly.getMonth() || now.getFullYear() !== lastMonthly.getFullYear())) {
        console.log('Performing monthly reset...');
        db.resetPeriodXP('monthly', now.getTime());
    }
}

module.exports = {
    init,
    checkAchievements,
    awardAchievement,
    checkResets,
    ACHIEVEMENTS
};
