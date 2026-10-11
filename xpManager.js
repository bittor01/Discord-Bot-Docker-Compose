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
            sessionStartTimestamp: session.session_start_timestamp || now,
            aloneTimestamp: session.alone_timestamp || null
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
            sessionStartTimestamp: now,
            aloneTimestamp: null
        };
    } else {
        if (session.channelId !== channelId) {
            session.channelId = channelId;
            session.sessionStartTimestamp = now; // New session on move
            session.acclimation = 0; // Reset acclimation when joining a new channel
            session.aloneTimestamp = null;
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
        session.sessionStartTimestamp,
        session.aloneTimestamp
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
    // If member is not found in the channel list, return default zero multiplier structure
    if (!member) return { total: 0, buffs: [] };

    // 2. Sort all members in the channel by acclimation percentage descending
    // to ensure group bonus steps are applied in order of highest acclimated members first.
    const sortedMembers = [...channelMembers].sort((a, b) => b.acclimation - a.acclimation);

    // 3. Calculate raw Group Bonus sum from all other channel members
    // Formula: sum(bonusStep^(j+1) * memberAcclimation) for all OTHER members in the room.
    let groupSum = 0;
    // Filter out the current user to evaluate contribution from peers only.
    const otherMembers = sortedMembers.filter(m => m.userId !== userId);
    // Loop through each peer member to sum up their tiered group bonus contribution.
    for (let j = 0; j < otherMembers.length; j++) {
        // Calculate bonus step factor (e.g., 0.5^1 for 1st peer, 0.5^2 for 2nd peer).
        const bonusStep = Math.pow(XP_GROUP_BONUS_STEP, j + 1);
        // Add weighted contribution of peer member scaled by peer's acclimation.
        groupSum += bonusStep * otherMembers[j].acclimation;
    }

    // 4. Combine with receiving user's own acclimation level
    // The total group bonus is scaled by the receiving user's own acclimation percentage.
    const scaledGroupBonus = member.acclimation * groupSum;
    // Add scaled group bonus to base 1.0x multiplier.
    const finalGroupMult = 1.0 + scaledGroupBonus;

    // 5. Apply Voice State Modifiers (Mute/Deaf)
    // Initialize individual multiplier baseline at 1.0.
    let individualMult = 1.0;

    // Use the provided guildMember override if available, otherwise fetch from API/cache
    const guildMember = guildMemberOverride || await fetchGuildMember(client, member.channelId || member.channel_id, userId, limiter);

    // Check voice state penalties if GuildMember object is resolved
    if (guildMember) {
        // Apply deafened penalty if user is deafened or self-deafened
        if (guildMember.voice.deaf || guildMember.voice.selfDeaf) {
            // Deafened users get a significant penalty (e.g., 0.1x multiplier)
            individualMult *= (parseFloat(process.env.XP_MULTIPLIER_DEAFENED) || 0.1);
        } else if (guildMember.voice.mute || guildMember.voice.selfMute) {
            // Muted users get a moderate penalty (e.g., 0.5x multiplier)
            individualMult *= (parseFloat(process.env.XP_MULTIPLIER_MUTED) || 0.5);
        }
    }

    // 6. Apply Screenshare Bonus
    // Users sharing their screen receive a multiplier boost (e.g., 1.5x)
    if (member.isSharing) individualMult *= XP_SCREENSHARE_MULT;

    // 7. Identify all active "Buffs" or "Modifiers" affecting the user rate.
    const buffs = [];

    // Group Bonus Charm: displayed when scaled group bonus contribution is greater than 0
    if (scaledGroupBonus > 0) buffs.push({ id: 'group', value: scaledGroupBonus, type: 'buff' });

    // Acclimation Charm: displayed whenever acclimation is under 100% (< 1.0)
    if (member.acclimation < 1.0) buffs.push({ id: 'acclimation', value: member.acclimation, type: 'neutral' });

    // Screenshare Bonus
    if (member.isSharing) buffs.push({ id: 'sharing', value: XP_SCREENSHARE_MULT, type: 'buff' });

    // Voice State Penalties
    if (guildMember) {
        if (guildMember.voice.deaf || guildMember.voice.selfDeaf) {
            buffs.push({ id: 'deaf', value: (parseFloat(process.env.XP_MULTIPLIER_DEAFENED) || 0.1), type: 'debuff' });
        } else if (guildMember.voice.mute || guildMember.voice.selfMute) {
            buffs.push({ id: 'mute', value: (parseFloat(process.env.XP_MULTIPLIER_MUTED) || 0.5), type: 'debuff' });
        }
    }

    // Return the final combined multiplier and the list of active charms.
    return {
        total: finalGroupMult * individualMult,
        buffs
    };
}

async function tick(client, limiter) {
    const now = Date.now();
    const TICK_INTERVAL_MS = 10000;

    // Count present (active) members in each channel
    const channelActiveCounts = new Map();
    for (const [userId, session] of userSessions) {
        if (!session.leaveTimestamp) {
            const currentCount = channelActiveCounts.get(session.channelId) || 0;
            channelActiveCounts.set(session.channelId, currentCount + 1);
        }
    }

    // Update session states and acclimation for all tracked users
    for (const [userId, session] of userSessions) {
        const activeCount = channelActiveCounts.get(session.channelId) || 0;

        if (session.leaveTimestamp) {
            // User is currently absent (left channel / grace period)
            const awayTime = now - session.leaveTimestamp;
            const gracePeriodHold = GRACE_PERIOD_MS;
            const gracePeriodDecay = GRACE_PERIOD_MS;

            // If they've been gone past hold + decay, wipe session and clean up permission overwrites
            if (awayTime > gracePeriodHold + gracePeriodDecay) {
                const channel = await limiter.execute(() => client.channels.fetch(session.channelId).catch(() => null));
                if (channel) {
                    const overwrite = channel.permissionOverwrites.cache.get(userId);
                    if (overwrite) {
                        const everyoneOverwrites = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
                        const isLocked = everyoneOverwrites?.deny.has(PermissionFlagsBits.Connect);
                        const isPrivate = everyoneOverwrites?.deny.has(PermissionFlagsBits.ViewChannel);

                        if (isLocked || isPrivate) {
                            await limiter.execute(() => overwrite.delete());
                        }
                    }
                }

                userSessions.delete(userId);
                db.clearSession(userId);
                continue;
            } else if (awayTime > gracePeriodHold) {
                // Decay acclimation after initial grace hold period
                const decayProgress = (awayTime - gracePeriodHold) / gracePeriodDecay;
                session.acclimation = Math.max(0, session.acclimation * (1 - decayProgress));
            }
        } else {
            // User is actively in the channel
            if (activeCount >= 2) {
                // Channel has 2 or more members: clear aloneTimestamp and grow acclimation linearly
                session.aloneTimestamp = null;
                const timePassed = now - session.lastUpdate;
                const acclimationGain = timePassed / ACCLIMATION_TIME_MS;
                session.acclimation = Math.min(1.0, session.acclimation + acclimationGain);
            } else {
                // Channel has only 1 member (or 0 active members)
                if (session.acclimation === 0) {
                    // Joined alone or was already at 0%: remain at 0% and keep aloneTimestamp null
                    session.aloneTimestamp = null;
                } else {
                    // Had partial or full acclimation when the channel dropped to 1 member
                    if (!session.aloneTimestamp) {
                        session.aloneTimestamp = now;
                    }
                    const aloneTime = now - session.aloneTimestamp;
                    if (aloneTime >= GRACE_PERIOD_MS) {
                        // Grace period while alone expired: reset acclimation to 0% and clear aloneTimestamp
                        session.acclimation = 0;
                        session.aloneTimestamp = null;
                    }
                    // While aloneTime < GRACE_PERIOD_MS, acclimation remains frozen at its current level.
                }
            }
        }
        session.lastUpdate = now;
        persistSession(userId, session);
    }

    // Group active members by channel for XP distribution
    const channelGroups = new Map();
    for (const [userId, session] of userSessions) {
        if (session.leaveTimestamp) continue;
        if (!channelGroups.has(session.channelId)) {
            channelGroups.set(session.channelId, []);
        }
        channelGroups.get(session.channelId).push({
            userId,
            acclimation: session.acclimation,
            isSharing: session.isSharing,
            channelId: session.channelId
        });
    }

    // Award XP to every active member
    for (const [channelId, members] of channelGroups) {
        const channel = await limiter.execute(() => client.channels.fetch(channelId).catch(() => null));

        for (const member of members) {
            const guildMember = channel?.members.get(member.userId);
            const multData = await calculateMultiplier(client, member.userId, members, limiter, guildMember);
            const xpGain = XP_PER_SECOND * (TICK_INTERVAL_MS / 1000) * multData.total;

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

/**
 * Determines the shortest enabled leaderboard term based on configuration.
 * Priority: Weekly > Monthly > Lifetime.
 */
function getShortestPeriod() {
    // Check if Weekly is enabled in the environment.
    if (process.env.WEEKLY_LEADERBOARD_ENABLED === '1') return 'weekly';
    // Check if Monthly is enabled.
    if (process.env.MONTHLY_LEADERBOARD_ENABLED === '1') return 'monthly';
    // Fallback to Lifetime.
    return 'lifetime';
}

module.exports = {
    init,
    updateUserPresence,
    handleUserLeave,
    tick,
    calculateMultiplier,
    getLevelFromXP,
    getXPForLevel,
    getShortestPeriod,
    awardXP,
    userSessions
};
