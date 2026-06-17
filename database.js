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

// Export the database interface functions
module.exports = {
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
