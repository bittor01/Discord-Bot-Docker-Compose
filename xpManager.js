/**
 * xpManager.js
 * Handles XP calculation, acclimation logic, and group multipliers.
 */

const db = require('./database');
const { PermissionFlagsBits } = require('discord.js');

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
            session.acclimation = 0; // Reset acclimation when joining a new channel
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

/**
 * Calculates the total XP multiplier for a user based on their acclimation,
 * grouping bonus, and voice state (mute/deaf/screenshare).
 *
 * @param {Client} client Discord Client
 * @param {string} userId The ID of the user
 * @param {Array} channelMembers List of member data objects in the same channel
 * @param {RateLimiter} limiter The rate limiter for API calls
 * @param {GuildMember} [guildMemberOverride] Optional pre-fetched GuildMember object to avoid API calls
 */
async function calculateMultiplier(client, userId, channelMembers, limiter, guildMemberOverride = null) {
    // 1. Find the current user's session data from the provided member list
    const member = channelMembers.find(m => m.userId === userId);
    // If not found, they get no XP
    if (!member) return 0;

    // 2. Sort all members in the channel by acclimation (descending)
    // to calculate the fallout-style group bonus correctly.
    const sortedMembers = [...channelMembers].sort((a, b) => b.acclimation - a.acclimation);

    // 3. Calculate Group Bonus
    // Formula: 1 + sum(bonusStep^i * memberAcclimation) for all OTHER members
    let groupSum = 0;
    const otherMembers = sortedMembers.filter(m => m.userId !== userId);
    for (let j = 0; j < otherMembers.length; j++) {
        const bonusStep = Math.pow(XP_GROUP_BONUS_STEP, j + 1);
        groupSum += bonusStep * otherMembers[j].acclimation;
    }

    // 4. Combine with user's own acclimation
    // Users start at 100% (1.0x) and gain more based on the group's acclimation.
    const finalGroupMult = 1.0 + groupSum;

    // 5. Apply Voice State Modifiers (Mute/Deaf)
    let individualMult = 1.0;

    // Use the override if provided, otherwise fetch from Discord (expensive)
    const guildMember = guildMemberOverride || await fetchGuildMember(client, member.channelId || member.channel_id, userId, limiter);

    if (guildMember) {
        if (guildMember.voice.deaf || guildMember.voice.selfDeaf) {
            // Deafened users get a significant penalty (e.g., 0.1x)
            individualMult *= (parseFloat(process.env.XP_MULTIPLIER_DEAFENED) || 0.1);
        } else if (guildMember.voice.mute || guildMember.voice.selfMute) {
            // Muted users get a moderate penalty (e.g., 0.5x)
            individualMult *= (parseFloat(process.env.XP_MULTIPLIER_MUTED) || 0.5);
        }
    }

    // 6. Apply Screenshare Bonus
    // Users sharing their screen get a boost (e.g., 1.5x)
    if (member.isSharing) individualMult *= XP_SCREENSHARE_MULT;

    // Return the final combined multiplier
    return finalGroupMult * individualMult;
}

async function tick(client, limiter) {
    const now = Date.now();
    const TICK_INTERVAL_MS = 10000;

    // First, update all active sessions (decay away-time, grow acclimation)
    for (const [userId, session] of userSessions) {
        if (session.leaveTimestamp) {
            const awayTime = now - session.leaveTimestamp;
            const gracePeriodHold = GRACE_PERIOD_MS;
            const gracePeriodDecay = GRACE_PERIOD_MS;

            // If they've been gone past the grace period, wipe the session
            if (awayTime > gracePeriodHold + gracePeriodDecay) {
                // If the channel was Locked or Private, we need to remove their permission overwrite
                // to prevent them from re-joining now that their session/acclimation has expired.
                const channel = await limiter.execute(() => client.channels.fetch(session.channelId).catch(() => null));
                if (channel) {
                    // Find the user's specific overwrite in this channel.
                    const overwrite = channel.permissionOverwrites.cache.get(userId);
                    if (overwrite) {
                        // We only remove it if the channel is currently Locked (Connect denied for @everyone).
                        // This enforces the rule that they lose their "spot" if they stay away too long.
                        const everyoneOverwrites = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
                        const isLocked = everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);

                        if (isLocked) {
                            // Delete the overwrite to revoke their explicit Connect/ViewChannel permissions.
                            await limiter.execute(() => overwrite.delete());
                        }
                    }
                }

                // Remove from memory and database.
                userSessions.delete(userId);
                db.clearSession(userId);
                continue;
            } else if (awayTime > gracePeriodHold) {
                // Decay acclimation after the initial hold period
                const decayProgress = (awayTime - gracePeriodHold) / gracePeriodDecay;
                session.acclimation = Math.max(0, session.acclimation * (1 - decayProgress));
            }
        } else {
            // Grow acclimation while they are active in the channel
            const timePassed = now - session.lastUpdate;
            const acclimationGain = timePassed / ACCLIMATION_TIME_MS;
            session.acclimation = Math.min(1.0, session.acclimation + acclimationGain);
        }
        session.lastUpdate = now;
        persistSession(userId, session);
    }

    // Group active members by channel
    const channelGroups = new Map();
    for (const [userId, session] of userSessions) {
        if (session.leaveTimestamp) continue;
        if (!channelGroups.has(session.channelId)) {
            channelGroups.set(session.channelId, []);
        }
        // Include enough data for the multiplier calculation
        channelGroups.get(session.channelId).push({
            userId,
            acclimation: session.acclimation,
            isSharing: session.isSharing,
            channelId: session.channelId
        });
    }

    // Award XP to every active member
    for (const [channelId, members] of channelGroups) {
        // Optimization: Fetch the channel and its members once per group
        const channel = await limiter.execute(() => client.channels.fetch(channelId).catch(() => null));

        for (const member of members) {
            // Optimization: Get the GuildMember object from the already-fetched channel cache
            const guildMember = channel?.members.get(member.userId);

            // Calculate real-time multiplier using the extracted function (passing the pre-fetched member)
            const totalMultiplier = await calculateMultiplier(client, member.userId, members, limiter, guildMember);

            // Calculate XP gain (Base * Time * Multiplier)
            const xpGain = XP_PER_SECOND * (TICK_INTERVAL_MS / 1000) * totalMultiplier;

            if (xpGain > 0) {
                awardXP(member.userId, xpGain);
            }
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
    calculateMultiplier,
    getLevelFromXP,
    getXPForLevel,
    awardXP,
    userSessions
};
