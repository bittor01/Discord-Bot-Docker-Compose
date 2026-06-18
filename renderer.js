/**
 * renderer.js
 */

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');

// Register FontAwesome for icons in the status charms
registerFont(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts/fa-solid-900.ttf'), { family: 'FontAwesome' });

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

    // 3. Setup Font Stack
    const fontStack = 'sans-serif, "Noto Sans", "DejaVu Sans", "Noto Color Emoji"';

    // 4. Iterate through members and draw their status rows
    members.forEach((m, i) => {
        // Vertical position for this member row
        const y = padding + 20 + i * rowHeight;

        // --- DRAW LEVEL ---
        // Larger font for Level
        ctx.fillStyle = '#faa61a'; // Gold/Yellow for levels
        ctx.font = `bold 18px ${fontStack}`;
        const levelText = `${m.level}`;
        ctx.fillText(levelText, padding, y);

        // --- DRAW NAME ---
        // Larger font for Name
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 20px ${fontStack}`;
        // Truncate name slightly less as we have space
        const nameText = m.name.length > 20 ? m.name.substring(0, 18) + '..' : m.name;
        ctx.fillText(nameText, padding + 35, y);

        // --- DRAW STUMPY XP BAR ---
        // Wider bar to use more of the 700px width
        const barX = padding + 220; // Adjusted for larger name space
        const barY = y - 20;
        const barWidth = 240; // Increased to use more space
        const barHeight = 24; // Increased height

        // Bar background
        ctx.fillStyle = '#4f545c';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 4);
        ctx.fill();

        // Bar fill progress
        if (m.progress > 0) {
            let fillColor = m.progress < 0.35 ? '#ff4742' : (m.progress < 0.75 ? '#faa61a' : '#43b581');
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            const fillWidth = Math.max(8, barWidth * m.progress);
            ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
            ctx.fill();
        }

        // --- DRAW CHARMS / BUFFS ---
        let charmX = barX + barWidth + 20; // More spacing after bar
        const charmY = y - 20;
        const charmSize = 24; // Increased charm size
        const charmSpacing = 8; // More spacing between charms

        (m.buffs || []).forEach(buff => {
            // Use more vibrant colors ("pop") for the charms.
            let color = '#2ecc71'; // Vibrant Green (buff)
            let icon = ''; // Symbol from FontAwesome

            if (buff.type === 'debuff') color = '#e74c3c'; // Vibrant Red (debuff)
            if (buff.type === 'neutral') color = '#95a5a6'; // Clear Gray (neutral)

            // Define symbols for each buff ID using FontAwesome unicode icons.
            switch (buff.id) {
                case 'group':
                    icon = '\uf0c0'; // 'users' icon
                    break;
                case 'sharing':
                    icon = '\uf108'; // 'desktop' icon
                    color = '#9b59b6'; // Vibrant Purple
                    break;
                case 'acclimation':
                    icon = '\uf017'; // 'clock' icon
                    break;
                case 'mute':
                    icon = '\uf131'; // 'microphone-slash' icon
                    break;
                case 'deaf':
                    icon = '\uf6a9'; // 'volume-xmark' icon
                    break;
            }

            // Draw vibrant charm circle
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(charmX + charmSize / 2, charmY + charmSize / 2, charmSize / 2, 0, Math.PI * 2);
            ctx.fill();

            // Draw white FontAwesome icon centered in the circle
            ctx.fillStyle = '#ffffff';
            // Use FontAwesome family for the icon
            ctx.font = `12px "FontAwesome"`;
            ctx.textAlign = 'center';
            ctx.fillText(icon, charmX + charmSize / 2, charmY + charmSize / 2 + 5);
            ctx.textAlign = 'left';

            charmX += charmSize + charmSpacing;
        });

        // --- DRAW MULTIPLIER ---
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 16px ${fontStack}`; // Larger multiplier font
        // Position multiplier after the charms
        ctx.fillText(`${(m.multiplier || 0).toFixed(2)}x`, charmX + 10, y);
    });

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
