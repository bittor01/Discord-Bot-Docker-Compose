/**
 * renderer.js
 */

const { createCanvas, registerFont, loadImage } = require('canvas');

/**
 * Renders the control panel image showing members, their acclimation bars, and multipliers.
 */
async function renderControlPanelImage(members) {
    // 1. Setup Canvas dimensions
    // Width increased to 700 to accommodate longer names and the "LIVE" tag
    const width = 700;
    const rowHeight = 60; // Increased row height for better vertical spacing
    const padding = 30;
    const height = Math.max(120, members.length * rowHeight + 80);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 2. Draw Background
    // Using a dark, professional Discord-style charcoal
    ctx.fillStyle = '#23272a';
    ctx.fillRect(0, 0, width, height);

    // 3. Draw Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Channel Members & Acclimation', padding, 45);

    // 4. Iterate through members and draw their status rows
    members.forEach((m, i) => {
        const y = 90 + i * rowHeight;

        // Draw Member Name
        // We truncate the name if it's too long to prevent overlap with the bar
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        const nameText = m.name.length > 22 ? m.name.substring(0, 19) + '...' : m.name;
        ctx.fillText(nameText, padding, y);

        // Define Bar Dimensions
        // Moved bar further right (barX = 230) to give names more room
        const barX = 230;
        const barY = y - 20;
        const barWidth = 300;
        const barHeight = 24; // Taller bar for a "solid" feel

        // Draw Bar Background (Gray track)
        ctx.fillStyle = '#4f545c';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 4); // Rounded corners for modern look
        ctx.fill();

        // Draw XP Fill (Red -> Yellow -> Green based on acclimation)
        if (m.acclimation > 0) {
            let fillColor;
            if (m.acclimation < 0.35) {
                fillColor = '#ff4742'; // Red for low acclimation
            } else if (m.acclimation < 0.75) {
                fillColor = '#faa61a'; // Yellow/Orange for mid-range
            } else {
                fillColor = '#43b581'; // Green for high acclimation
            }

            ctx.fillStyle = fillColor;
            ctx.beginPath();
            // Ensure the fill also has rounded corners.
            // Math.max(barHeight, ...) ensures even tiny fills look decent.
            const fillWidth = Math.max(8, barWidth * m.acclimation);
            ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
            ctx.fill();
        }

        // Draw Multiplier Text
        ctx.fillStyle = '#b9bbbe';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${(m.multiplier || 0).toFixed(2)}x`, barX + barWidth + 15, y - 2);

        // Draw "LIVE" tag if screensharing
        // Replaces the "📺" emoji which often fails to render (showing squares) on Linux servers
        if (m.isSharing) {
            const tagX = barX + barWidth + 65;
            const tagY = y - 20;
            const tagW = 45;
            const tagH = 22;

            ctx.fillStyle = '#ff73fa'; // Screenshare purple
            ctx.beginPath();
            ctx.roundRect(tagX, tagY, tagW, tagH, 3);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('LIVE', tagX + tagW / 2, tagY + 15);
            ctx.textAlign = 'left'; // Reset alignment
        }
    });

    // 5. Final Header Separator
    ctx.strokeStyle = '#2c2f33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, 60);
    ctx.lineTo(width - padding, 60);
    ctx.stroke();

    return canvas.toBuffer('image/png');
}

async function renderStatsCard(userData) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#23272a');
    bgGradient.addColorStop(1, '#2c2f33');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#7289da';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(userData.username, 50, 80);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(`LVL ${userData.level}`, 50, 160);
    const barWidth = 700;
    const barHeight = 30;
    const barX = 50;
    const barY = 200;
    ctx.fillStyle = '#4f545c';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#7289da';
    ctx.fillRect(barX, barY, barWidth * userData.xpProgress, barHeight);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${userData.currentXP.toLocaleString()} / ${userData.neededXP.toLocaleString()} XP`, 50, 260);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#b9bbbe';
    ctx.fillText(`Weekly XP: ${userData.weeklyXP.toLocaleString()}`, 50, 320);
    ctx.fillText(`Monthly XP: ${userData.monthlyXP.toLocaleString()}`, 50, 350);
    ctx.fillText(`Achievements: ${userData.achievementsCount}`, 400, 320);
    return canvas.toBuffer('image/png');
}

async function renderLeaderboard(data) {
    const width = 600;
    const rowHeight = 60;
    const height = 100 + data.entries.length * rowHeight;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#23272a';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#7289da';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`${data.period.toUpperCase()} LEADERBOARD`, 50, 60);
    data.entries.forEach((e, i) => {
        const y = 130 + i * rowHeight;
        ctx.fillStyle = i < 3 ? '#ffd700' : '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`${i + 1}.`, 30, y);
        ctx.font = '20px sans-serif';
        ctx.fillText(e.username.substring(0, 20), 80, y);
        ctx.fillStyle = '#b9bbbe';
        ctx.font = '16px sans-serif';
        ctx.fillText(`LVL ${e.level} - ${Math.floor(e.xp).toLocaleString()} XP`, 350, y);
        ctx.fillStyle = '#4f545c';
        ctx.fillRect(80, y + 10, 480, 5);
    });
    return canvas.toBuffer('image/png');
}

module.exports = {
    renderControlPanelImage,
    renderStatsCard,
    renderLeaderboard
};
