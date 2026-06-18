// Import the better-sqlite3 library to handle the database
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || './data/state.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initial setup
db.exec(`
    CREATE TABLE IF NOT EXISTS active_channels (
        voice_channel_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        control_message_id TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        xp REAL DEFAULT 0,
        weekly_xp REAL DEFAULT 0,
        monthly_xp REAL DEFAULT 0,
        level INTEGER DEFAULT 0,
        weekly_level INTEGER DEFAULT 0,
        monthly_level INTEGER DEFAULT 0,
        last_notif_timestamp INTEGER DEFAULT 0,
        last_level_notified INTEGER DEFAULT 0,
        last_reset_weekly INTEGER DEFAULT 0,
        last_reset_monthly INTEGER DEFAULT 0
    )
`);

// Migration: Add missing columns if they don't exist
// This handles cases where the table was created before the new columns were added
const tableInfo = db.prepare('PRAGMA table_info(users)').all();
const columns = tableInfo.map(c => c.name);

if (!columns.includes('weekly_xp')) db.exec('ALTER TABLE users ADD COLUMN weekly_xp REAL DEFAULT 0');
if (!columns.includes('monthly_xp')) db.exec('ALTER TABLE users ADD COLUMN monthly_xp REAL DEFAULT 0');
if (!columns.includes('weekly_level')) db.exec('ALTER TABLE users ADD COLUMN weekly_level INTEGER DEFAULT 0');
if (!columns.includes('monthly_level')) db.exec('ALTER TABLE users ADD COLUMN monthly_level INTEGER DEFAULT 0');
if (!columns.includes('last_reset_weekly')) db.exec('ALTER TABLE users ADD COLUMN last_reset_weekly INTEGER DEFAULT 0');
if (!columns.includes('last_reset_monthly')) db.exec('ALTER TABLE users ADD COLUMN last_reset_monthly INTEGER DEFAULT 0');

db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
        achievement_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        xp_reward REAL DEFAULT 0,
        type TEXT DEFAULT 'lifetime'
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS user_achievements (
        user_id TEXT,
        achievement_id TEXT,
        earned_at INTEGER,
        period_key TEXT,
        PRIMARY KEY (user_id, achievement_id, period_key)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS session_state (
        user_id TEXT PRIMARY KEY,
        channel_id TEXT,
        acclimation_percent REAL DEFAULT 0,
        last_seen_timestamp INTEGER,
        is_sharing_screen INTEGER DEFAULT 0,
        session_start_timestamp INTEGER
    )
`);

// Migration: Add session_start_timestamp to session_state if missing
const sessionTableInfo = db.prepare('PRAGMA table_info(session_state)').all();
const sessionColumns = sessionTableInfo.map(c => c.name);
if (!sessionColumns.includes('session_start_timestamp')) {
    db.exec('ALTER TABLE session_state ADD COLUMN session_start_timestamp INTEGER');
}

module.exports = {
    getUser: (userId) => {
        const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
        let user = stmt.get(userId);
        if (!user) {
            db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
            user = stmt.get(userId);
        }
        return user;
    },

    updateUserXP: (userId, xpGain, newLevel, newWeeklyLevel, newMonthlyLevel) => {
        const stmt = db.prepare(`
            UPDATE users
            SET xp = xp + ?,
                weekly_xp = weekly_xp + ?,
                monthly_xp = monthly_xp + ?,
                level = ?,
                weekly_level = ?,
                monthly_level = ?
            WHERE user_id = ?
        `);
        return stmt.run(xpGain, xpGain, xpGain, newLevel, newWeeklyLevel, newMonthlyLevel, userId);
    },

    setUserXP: (userId, xp, period = 'lifetime') => {
        let col = 'xp';
        if (period === 'weekly') col = 'weekly_xp';
        if (period === 'monthly') col = 'monthly_xp';
        const stmt = db.prepare(`UPDATE users SET ${col} = ? WHERE user_id = ?`);
        return stmt.run(xp, userId);
    },

    updateLastNotified: (userId, level, timestamp) => {
        const stmt = db.prepare('UPDATE users SET last_level_notified = ?, last_notif_timestamp = ? WHERE user_id = ?');
        return stmt.run(level, timestamp, userId);
    },

    resetPeriodXP: (period, timestamp) => {
        if (period === 'weekly') {
            db.prepare('UPDATE users SET weekly_xp = 0, weekly_level = 0, last_reset_weekly = ?').run(timestamp);
        } else if (period === 'monthly') {
            db.prepare('UPDATE users SET monthly_xp = 0, monthly_level = 0, last_reset_monthly = ?').run(timestamp);
        }
    },

    getGlobalState: () => {
        // We use a dummy user or separate table for global state, here using first user's reset fields as proxy or simple getter
        return db.prepare('SELECT MAX(last_reset_weekly) as last_weekly, MAX(last_reset_monthly) as last_monthly FROM users').get();
    },

    getUserPercentile: (userId, period = 'lifetime') => {
        let col = 'xp';
        if (period === 'weekly') col = 'weekly_xp';
        if (period === 'monthly') col = 'monthly_xp';
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        if (totalUsers <= 1) return 100;
        const userXP = db.prepare(`SELECT ${col} FROM users WHERE user_id = ?`).get(userId)?.[col] || 0;
        const usersBelow = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${col} < ?`).get(userXP).count;
        return (usersBelow / (totalUsers - 1)) * 100;
    },

    addAchievementDef: (id, name, description, icon, xpReward, type) => {
        const stmt = db.prepare('INSERT OR REPLACE INTO achievements (achievement_id, name, description, icon, xp_reward, type) VALUES (?, ?, ?, ?, ?, ?)');
        return stmt.run(id, name, description, icon, xpReward, type);
    },

    giveAchievement: (userId, achievementId, periodKey = 'lifetime') => {
        const stmt = db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, earned_at, period_key) VALUES (?, ?, ?, ?)');
        return stmt.run(userId, achievementId, Date.now(), periodKey);
    },

    getUserAchievements: (userId) => {
        const stmt = db.prepare(`
            SELECT a.*, ua.earned_at, ua.period_key
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.achievement_id
            WHERE ua.user_id = ?
        `);
        return stmt.all(userId);
    },

    updateSession: (userId, channelId, acclimation, lastSeen, isSharing, sessionStart) => {
        const stmt = db.prepare(`
            INSERT INTO session_state (user_id, channel_id, acclimation_percent, last_seen_timestamp, is_sharing_screen, session_start_timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                channel_id = excluded.channel_id,
                acclimation_percent = excluded.acclimation_percent,
                last_seen_timestamp = excluded.last_seen_timestamp,
                is_sharing_screen = excluded.is_sharing_screen,
                session_start_timestamp = excluded.session_start_timestamp
        `);
        return stmt.run(userId, channelId, acclimation, lastSeen, isSharing ? 1 : 0, sessionStart);
    },

    getSession: (userId) => {
        return db.prepare('SELECT * FROM session_state WHERE user_id = ?').get(userId);
    },

    getAllSessions: () => {
        return db.prepare('SELECT * FROM session_state').all();
    },

    clearSession: (userId) => {
        return db.prepare('DELETE FROM session_state WHERE user_id = ?').run(userId);
    },

    addChannel: (voiceId, ownerId, controlMsgId) => {
        const stmt = db.prepare('INSERT INTO active_channels (voice_channel_id, owner_id, control_message_id) VALUES (?, ?, ?)');
        return stmt.run(voiceId, ownerId, controlMsgId);
    },

    getChannel: (voiceId) => {
        const stmt = db.prepare('SELECT * FROM active_channels WHERE voice_channel_id = ?');
        return stmt.get(voiceId);
    },

    removeChannel: (voiceId) => {
        const stmt = db.prepare('DELETE FROM active_channels WHERE voice_channel_id = ?');
        return stmt.run(voiceId);
    },

    getAllChannels: () => {
        const stmt = db.prepare('SELECT * FROM active_channels');
        return stmt.all();
    },

    getLeaderboard: (period = 'lifetime', limit = 10) => {
        let col = 'xp';
        let lvlCol = 'level';
        if (period === 'weekly') { col = 'weekly_xp'; lvlCol = 'weekly_level'; }
        if (period === 'monthly') { col = 'monthly_xp'; lvlCol = 'monthly_level'; }
        return db.prepare(`SELECT user_id, ${col} as xp, ${lvlCol} as level FROM users ORDER BY ${col} DESC LIMIT ?`).all(limit);
    }
};
