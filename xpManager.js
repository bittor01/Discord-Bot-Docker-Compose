/**
 * xpManager.js
 * Handles XP calculation, acclimation logic, and group multipliers.
 */

const db = require('./database');

const ACCLIMATION_TIME_MS = (parseInt(process.env.ACCLIMATION_TIME_MINUTES) || 15) * 60 * 1000;
const GRACE_PERIOD_MS = (parseFloat(process.env.ACCLIMATION_GRACE_PERIOD_MINUTES) || 7.5) * 60 * 1000;
const XP_PER_SECOND = parseFloat(process.env.XP_PER_SECOND) || 1;
const XP_GROUP_BONUS_STEP = parseFloat(process.env.XP_GROUP_BONUS_STEP) || 0.5;
const XP_SCREENSHARE_MULT = parseFloat(process.env.XP_MULTIPLIER_SCREENSHARE) || 1.5;

const userSessions = new Map();

function init() {
    const sessions = db.getAllSessions();
    const now = Date.now();
    for (const session of sessions) {
        userSessions.set(session.user_id, {
            channelId: session.channel_id,
            acclimation: session.acclimation_percent,
            lastUpdate: now,
            leaveTimestamp: session.last_seen_timestamp,
            isSharing: session.is_sharing_screen === 1,
            sessionStartTimestamp: session.session_start_timestamp || now
        });
    }
}

function updateUserPresence(userId, channelId, isSharing = false) {
    const now = Date.now();
    let session = userSessions.get(userId);

    if (!session) {
        session = {
            channelId,
            acclimation: 0,
            lastUpdate: now,
            leaveTimestamp: null,
            isSharing,
            sessionStartTimestamp: now
        };
    } else {
        if (session.channelId !== channelId) {
            session.channelId = channelId;
            session.sessionStartTimestamp = now; // New session on move
        }
        session.leaveTimestamp = null;
        session.isSharing = isSharing;
    }
    userSessions.set(userId, session);
    persistSession(userId, session);
}

function handleUserLeave(userId) {
    const session = userSessions.get(userId);
    if (session) {
        session.leaveTimestamp = Date.now();
        session.isSharing = false;
        persistSession(userId, session);
    }
}

function persistSession(userId, session) {
    db.updateSession(
        userId,
        session.channelId,
        session.acclimation,
        session.leaveTimestamp,
        session.isSharing,
        session.sessionStartTimestamp
    );
}

async function tick(client, limiter) {
    const now = Date.now();
    const TICK_INTERVAL_MS = 10000;

    for (const [userId, session] of userSessions) {
        if (session.leaveTimestamp) {
            const awayTime = now - session.leaveTimestamp;
            const gracePeriodHold = GRACE_PERIOD_MS;
            const gracePeriodDecay = GRACE_PERIOD_MS;

            if (awayTime > gracePeriodHold + gracePeriodDecay) {
                userSessions.delete(userId);
                db.clearSession(userId);
                continue;
            } else if (awayTime > gracePeriodHold) {
                const decayProgress = (awayTime - gracePeriodHold) / gracePeriodDecay;
                session.acclimation = Math.max(0, session.acclimation * (1 - decayProgress));
            }
        } else {
            const timePassed = now - session.lastUpdate;
            const acclimationGain = timePassed / ACCLIMATION_TIME_MS;
            session.acclimation = Math.min(1.0, session.acclimation + acclimationGain);
        }
        session.lastUpdate = now;
        persistSession(userId, session);
    }

    const channelGroups = new Map();
    for (const [userId, session] of userSessions) {
        if (session.leaveTimestamp) continue;
        if (!channelGroups.has(session.channelId)) {
            channelGroups.set(session.channelId, []);
        }
        channelGroups.get(session.channelId).push({ userId, acclimation: session.acclimation, isSharing: session.isSharing, sessionStartTimestamp: session.sessionStartTimestamp });
    }

    for (const [channelId, members] of channelGroups) {
        members.sort((a, b) => b.acclimation - a.acclimation);

        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            const userId = member.userId;

            let groupSum = 0;
            const otherMembers = members.filter(m => m.userId !== userId);
            for (let j = 0; j < otherMembers.length; j++) {
                const bonusStep = Math.pow(XP_GROUP_BONUS_STEP, j + 1);
                groupSum += bonusStep * otherMembers[j].acclimation;
            }

            const baseGroupMult = 1.0 + groupSum;
            const finalGroupMult = member.acclimation * baseGroupMult;

            let individualMult = 1.0;
            const guildMember = await fetchGuildMember(client, channelId, userId, limiter);
            if (guildMember) {
                if (guildMember.voice.deaf || guildMember.voice.selfDeaf) {
                    individualMult *= (parseFloat(process.env.XP_MULTIPLIER_DEAFENED) || 0.1);
                } else if (guildMember.voice.mute || guildMember.voice.selfMute) {
                    individualMult *= (parseFloat(process.env.XP_MULTIPLIER_MUTED) || 0.5);
                }
            }

            if (member.isSharing) individualMult *= XP_SCREENSHARE_MULT;

            const totalMultiplier = finalGroupMult * individualMult;
            const xpGain = XP_PER_SECOND * (TICK_INTERVAL_MS / 1000) * totalMultiplier;

            if (xpGain > 0) {
                awardXP(userId, xpGain);
            }

            // Check achievements (moved to index.js to handle circularity or just pass achievementManager here)
            // For now, we'll return the data to index.js or use an event
        }
    }
}

async function fetchGuildMember(client, channelId, userId, limiter) {
    try {
        const channel = await limiter.execute(() => client.channels.fetch(channelId).catch(() => null));
        if (!channel) return null;
        return channel.members.get(userId);
    } catch (e) {
        return null;
    }
}

function awardXP(userId, xpGain) {
    const userRecord = db.getUser(userId);
    const newTotalXP = userRecord.xp + xpGain;
    const newWeeklyXP = userRecord.weekly_xp + xpGain;
    const newMonthlyXP = userRecord.monthly_xp + xpGain;

    const newLevel = getLevelFromXP(newTotalXP);
    const newWeeklyLevel = getLevelFromXP(newWeeklyXP);
    const newMonthlyLevel = getLevelFromXP(newMonthlyXP);

    db.updateUserXP(userId, xpGain, newLevel, newWeeklyLevel, newMonthlyLevel);
}

function getLevelFromXP(totalXP) {
    const base = parseFloat(process.env.XP_LEVEL_BASE) || 900;
    const ramp = parseFloat(process.env.XP_LEVEL_RAMP) || 1.1;
    let level = 0;
    let xpForNext = base;
    while (totalXP >= xpForNext) {
        totalXP -= xpForNext;
        level++;
        xpForNext = Math.floor(base * Math.pow(ramp, level));
    }
    return level;
}

function getXPForLevel(level) {
    const base = parseFloat(process.env.XP_LEVEL_BASE) || 900;
    const ramp = parseFloat(process.env.XP_LEVEL_RAMP) || 1.1;
    if (level <= 0) return 0;
    let total = 0;
    for (let i = 0; i < level; i++) {
        total += Math.floor(base * Math.pow(ramp, i));
    }
    return total;
}

module.exports = {
    init,
    updateUserPresence,
    handleUserLeave,
    tick,
    getLevelFromXP,
    getXPForLevel,
    awardXP,
    userSessions
};
