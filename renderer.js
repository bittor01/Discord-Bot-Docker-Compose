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
    // Set rowHeight to 64px for a more substantial vertical presence for each member row.
    const rowHeight = 64;
    // Reduce padding to 10px for a clean look while still being close to the edges.
    const padding = 10;
    // Update the canvas height calculation to be more compact and fit the rows better.
    // We use padding * 2 to account for top and bottom spacing.
    const height = Math.max(80, members.length * rowHeight + padding * 2);
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
        // Set textBaseline to middle to enable precise vertical centering of all row elements.
        ctx.textBaseline = 'middle';
        // Calculate the vertical center point for each member row.
        const rowCenterY = padding + (i * rowHeight) + (rowHeight / 2);

        // --- DRAW LEVEL ---
        // Increase font size for Level to bold 20px for better visibility.
        ctx.fillStyle = '#faa61a'; // Gold/Yellow for levels
        ctx.font = `bold 20px ${fontStack}`;
        const levelText = `${m.level}`;
        // Position Level text at the start of the row, vertically centered.
        ctx.fillText(levelText, padding, rowCenterY);

        // --- DRAW NAME ---
        // Increase font size for Name to bold 22px for a more prominent look.
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 22px ${fontStack}`;
        // Position Name text next to the Level, ensuring enough space for 2-3 digit levels.
        // We use X=48 to stay close to the edge.
        const nameX = 48;
        // Position the Progress Bar further right to give more room for the name.
        const barX = 260;
        // Calculate the maximum width for the name based on new positions.
        const maxNameWidth = barX - nameX - 15;
        let nameText = m.name;
        // If the name is too wide, truncate it dynamically using measureText.
        if (ctx.measureText(nameText).width > maxNameWidth) {
            while (ctx.measureText(nameText + '..').width > maxNameWidth && nameText.length > 0) {
                nameText = nameText.substring(0, nameText.length - 1);
            }
            nameText += '..';
        }
        // Draw the dynamically truncated name.
        ctx.fillText(nameText, nameX, rowCenterY);

        // --- DRAW STUMPY XP BAR ---
        // Increase barHeight to 36px for a thick, modern feel.
        const barHeight = 36;
        // Center the bar vertically on the rowCenterY.
        const barY = rowCenterY - (barHeight / 2);
        // Set barWidth to 260px to balance name space and charm space on the 700px width.
        const barWidth = 260;

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
        // Start charms after the progress bar with a 15px buffer.
        let charmX = barX + barWidth + 15;
        // Set charm size to 28px to maintain a pleasing aspect ratio with the 36px bar.
        const charmSize = 28;
        // Center the charms vertically on the rowCenterY.
        const charmY = rowCenterY - (charmSize / 2);
        // Set charmSpacing to 4px for a compact layout.
        const charmSpacing = 4;

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
            // Set FontAwesome icon font size to 14px for better visibility within the 32px charm.
            ctx.font = `14px "FontAwesome"`;
            ctx.textAlign = 'center';
            // Draw the icon exactly in the center of the charm circle.
            // Since we use textBaseline = 'middle', we just use the center coordinates.
            ctx.fillText(icon, charmX + charmSize / 2, rowCenterY);
            ctx.textAlign = 'left';

            // Increment the horizontal position for the next charm.
            charmX += charmSize + charmSpacing;
        });

        // --- DRAW MULTIPLIER ---
        // Increase font size for the Multiplier to bold 18px.
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 18px ${fontStack}`;
        // Position the Multiplier text 10px after the last charm, vertically centered.
        ctx.fillText(`${(m.multiplier || 0).toFixed(2)}x`, charmX + 10, rowCenterY);
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
