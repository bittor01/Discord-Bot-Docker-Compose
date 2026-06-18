/**
 * renderer.js
 * Handles Canvas-based image rendering for progress bars and stat cards.
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');

// Register FontAwesome if available
// registerFont(path.join(__dirname, 'assets', 'fa-solid-900.ttf'), { family: 'FontAwesome' });

/**
 * Render a progress bar image
 * @param {Array} members List of { name, acclimation, multiplier, isSharing }
 */
async function renderControlPanelImage(members) {
    const width = 600;
    const rowHeight = 40;
    const height = Math.max(100, members.length * rowHeight + 40);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Member Status & Acclimation', 20, 30);

    // Rows
    members.forEach((m, i) => {
        const y = 60 + i * rowHeight;

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(m.name.substring(0, 15), 20, y);

        // Progress Bar Background
        ctx.fillStyle = '#4f545c';
        ctx.fillRect(150, y - 12, 300, 15);

        // Progress Bar Fill
        const gradient = ctx.createLinearGradient(150, 0, 450, 0);
        gradient.addColorStop(0, '#43b581');
        gradient.addColorStop(1, '#3ca374');
        ctx.fillStyle = gradient;
        ctx.fillRect(150, y - 12, 300 * m.acclimation, 15);

        // Multiplier Text
        ctx.fillStyle = '#b9bbbe';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${(m.multiplier || 1).toFixed(2)}x`, 460, y);

        // Status Icons (simplified text for now)
        if (m.isSharing) {
            ctx.fillStyle = '#ff73fa';
            ctx.fillText('📺', 520, y);
        }
    });

    return canvas.toBuffer('image/png');
}

/**
 * Render a User Stats Card
 */
async function renderStatsCard(userData) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background with a slight gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#23272a');
    bgGradient.addColorStop(1, '#2c2f33');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#7289da';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // User Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(userData.username, 50, 80);

    // Level
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(`LVL ${userData.level}`, 50, 160);

    // XP Bar
    const barWidth = 700;
    const barHeight = 30;
    const barX = 50;
    const barY = 200;

    ctx.fillStyle = '#4f545c';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = '#7289da';
    ctx.fillRect(barX, barY, barWidth * userData.xpProgress, barHeight);

    // XP Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${userData.currentXP.toLocaleString()} / ${userData.neededXP.toLocaleString()} XP`, 50, 260);

    // Stats Grid
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#b9bbbe';
    ctx.fillText(`Weekly XP: ${userData.weeklyXP.toLocaleString()}`, 50, 320);
    ctx.fillText(`Monthly XP: ${userData.monthlyXP.toLocaleString()}`, 50, 350);

    // Achievements count
    ctx.fillText(`Achievements: ${userData.achievementsCount}`, 400, 320);

    return canvas.toBuffer('image/png');
}

module.exports = {
    renderControlPanelImage,
    renderStatsCard
};
