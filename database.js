// Import the better-sqlite3 library to handle the database
const Database = require('better-sqlite3');
// Import path library for file path management
const path = require('path');
// Import fs for directory management
const fs = require('fs');

// Get the database path from environment variables or use a default
const dbPath = process.env.DATABASE_PATH || './data/state.db';

// Ensure the directory for the database exists
const dbDir = path.dirname(dbPath);
// If the directory does not exist, create it recursively
if (!fs.existsSync(dbDir)) {
    // Log the directory creation for debugging
    console.log(`Creating database directory: ${dbDir}`);
    // Create the directory
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize the SQLite database connection
const db = new Database(dbPath);

// Create the active_channels table if it doesn't already exist
// This table tracks temporary voice channels and their owners
db.exec(`
    CREATE TABLE IF NOT EXISTS active_channels (
        voice_channel_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        control_message_id TEXT
    )
`);

// Create the users table if it doesn't exist
// This table tracks user XP and Leveling progress
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        xp REAL DEFAULT 0,
        level INTEGER DEFAULT 0,
        last_notif_timestamp INTEGER DEFAULT 0,
        last_level_notified INTEGER DEFAULT 0
    )
`);

// Export the database interface functions
module.exports = {
    // User-related database operations

    // Function to get or create a user record
    getUser: (userId) => {
        const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
        let user = stmt.get(userId);
        if (!user) {
            // Initialize new user if not found
            db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
            user = stmt.get(userId);
        }
        return user;
    },

    // Function to update user XP and level
    updateUserXP: (userId, xpGain, newLevel) => {
        const stmt = db.prepare('UPDATE users SET xp = xp + ?, level = ? WHERE user_id = ?');
        return stmt.run(xpGain, newLevel, userId);
    },

    // Function to update the last notified level and timestamp
    updateLastNotified: (userId, level, timestamp) => {
        const stmt = db.prepare('UPDATE users SET last_level_notified = ?, last_notif_timestamp = ? WHERE user_id = ?');
        return stmt.run(level, timestamp, userId);
    },

    // Function to calculate the percentile rank of a user based on XP
    getUserPercentile: (userId) => {
        // Count total users
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        if (totalUsers <= 1) return 100; // Only user is 100th percentile

        // Count users with less XP than this user
        const userXP = db.prepare('SELECT xp FROM users WHERE user_id = ?').get(userId)?.xp || 0;
        const usersBelow = db.prepare('SELECT COUNT(*) as count FROM users WHERE xp < ?').get(userXP).count;
        const usersSame = db.prepare('SELECT COUNT(*) as count FROM users WHERE xp = ?').get(userXP).count;

        // Calculate percentile: ((number of people below + 0.5 * same) / total number of people) * 100
        // We use a simplified version for rank: (rank - 1) / (total - 1)
        // Here we just use: (usersBelow / (totalUsers - 1)) * 100
        return (usersBelow / (totalUsers - 1)) * 100;
    },

    // Channel-related database operations

    // Function to add a new active channel to the database
    addChannel: (voiceId, ownerId, controlMsgId) => {
        // Prepare the insert statement
        const stmt = db.prepare('INSERT INTO active_channels (voice_channel_id, owner_id, control_message_id) VALUES (?, ?, ?)');
        // Execute the statement with provided values
        return stmt.run(voiceId, ownerId, controlMsgId);
    },

    // Function to retrieve a channel's data by its voice channel ID
    getChannel: (voiceId) => {
        // Prepare the select statement
        const stmt = db.prepare('SELECT * FROM active_channels WHERE voice_channel_id = ?');
        // Return the first matching row
        return stmt.get(voiceId);
    },

    // Function to remove a channel from the database
    removeChannel: (voiceId) => {
        // Prepare the delete statement
        const stmt = db.prepare('DELETE FROM active_channels WHERE voice_channel_id = ?');
        // Execute the delete operation
        return stmt.run(voiceId);
    },

    // Function to get all active channels (useful for recovery on boot)
    getAllChannels: () => {
        // Prepare the select all statement
        const stmt = db.prepare('SELECT * FROM active_channels');
        // Return all rows as an array
        return stmt.all();
    }
};
