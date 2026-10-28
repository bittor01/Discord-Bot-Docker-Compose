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
            const fillWidth = Math.max(8, barWidth * m.progress);
            let gradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);

            // Percentile-based metallic colors
            // Platinum/Diamond: Top 10% (90+ percentile)
            // Gold: Top 25% (75+ percentile)
            // Silver: Top 50% (50+ percentile)
            // Bronze: Rest
            const p = m.percentile || 0;
            if (p >= 90) {
                // Platinum/Diamond
                gradient.addColorStop(0, '#e5e4e2');
                gradient.addColorStop(0.5, '#ffffff');
                gradient.addColorStop(1, '#b4b4b4');
            } else if (p >= 75) {
                // Gold
                gradient.addColorStop(0, '#ffd700');
                gradient.addColorStop(0.5, '#fff7ae');
                gradient.addColorStop(1, '#b8860b');
            } else if (p >= 50) {
                // Silver
                gradient.addColorStop(0, '#c0c0c0');
                gradient.addColorStop(0.5, '#e8e8e8');
                gradient.addColorStop(1, '#808080');
            } else {
                // Bronze
                gradient.addColorStop(0, '#cd7f32');
                gradient.addColorStop(0.5, '#e3af66');
                gradient.addColorStop(1, '#8b4513');
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
            ctx.fill();

            // Add metallic sheen/shine
            const sheen = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
            sheen.addColorStop(0, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.5, 'rgba(255,255,255,0.2)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen;
            ctx.fill();

            // Add texture/inner shadow effect
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, fillWidth, barHeight);
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

            // Draw vibrant charm circle with a subtle gradient and shadow
            const charmGradient = ctx.createRadialGradient(
                charmX + charmSize / 2, charmY + charmSize / 2, 0,
                charmX + charmSize / 2, charmY + charmSize / 2, charmSize / 2
            );
            charmGradient.addColorStop(0, color);
            charmGradient.addColorStop(1, 'rgba(0,0,0,0.3)');

            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            ctx.fillStyle = color; // Base color
            ctx.beginPath();
            ctx.arc(charmX + charmSize / 2, charmY + charmSize / 2, charmSize / 2, 0, Math.PI * 2);
            ctx.fill();

            // Apply gradient overlay
            ctx.fillStyle = charmGradient;
            ctx.fill();

            // Reset shadow for icon
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

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

    // Profile border
    ctx.strokeStyle = '#7289da';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    // Avatar
    const avatarSize = 120;
    const avatarX = 50;
    const avatarY = 50;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    if (userData.avatarUrl) {
        try {
            const avatarImg = await loadImage(userData.avatarUrl);
            ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        } catch (e) {
            ctx.fillStyle = '#4f545c';
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        }
    } else {
        ctx.fillStyle = '#4f545c';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    // Avatar ring
    ctx.strokeStyle = '#7289da';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(userData.username, avatarX + avatarSize + 30, 95);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 60px sans-serif';
    // Display the level from the chosen shortest-term period.
    ctx.fillText(`LVL ${userData.level}`, avatarX + avatarSize + 30, 165);

    // Draw the period label (e.g., "WEEKLY", "LIFETIME") to indicate which stats are shown.
    ctx.fillStyle = '#7289da';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${(userData.period || 'Lifetime').toUpperCase()} PROGRESS`, avatarX + avatarSize + 30, 115);

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
    const width = 700;
    const rowHeight = 80;
    const headerHeight = 120;
    const padding = 20;
    const height = headerHeight + data.entries.length * rowHeight + padding;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background with subtle texture/gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#2c2f33');
    bgGradient.addColorStop(1, '#23272a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Header with metallic sheen
    const headerGradient = ctx.createLinearGradient(0, 0, 0, headerHeight);
    headerGradient.addColorStop(0, '#7289da');
    headerGradient.addColorStop(0.5, '#99aab5');
    headerGradient.addColorStop(1, '#7289da');
    ctx.fillStyle = headerGradient;
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(`${data.period.toUpperCase()} HALL OF FAME`, width / 2, 75);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // Decorative line
    ctx.strokeStyle = '#7289da';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padding, headerHeight - 10);
    ctx.lineTo(width - padding, headerHeight - 10);
    ctx.stroke();

    for (let i = 0; i < data.entries.length; i++) {
        const e = data.entries[i];
        const y = headerHeight + i * rowHeight + rowHeight / 2;
        const rowY = headerHeight + i * rowHeight;

        // Alternating row backgrounds
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(padding, rowY, width - padding * 2, rowHeight);
        }

        // Rank with metallic color
        let rankColor = '#ffffff';
        if (i === 0) rankColor = '#ffd700'; // Gold
        else if (i === 1) rankColor = '#c0c0c0'; // Silver
        else if (i === 2) rankColor = '#cd7f32'; // Bronze

        ctx.fillStyle = rankColor;
        ctx.font = 'bold 32px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, padding + 10, y);

        // Avatar
        const avatarSize = 50;
        const avatarX = padding + 60;
        const avatarY = y - avatarSize / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (e.avatarUrl) {
            try {
                const avatarImg = await loadImage(e.avatarUrl);
                ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
            } catch (err) {
                // Fallback for failed avatar load
                ctx.fillStyle = '#4f545c';
                ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
            }
        } else {
            ctx.fillStyle = '#4f545c';
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        }
        ctx.restore();

        // Circular border for avatar
        ctx.strokeStyle = rankColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.stroke();

        // Username
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(e.username.substring(0, 18), avatarX + avatarSize + 15, y);

        // Stats with badge-like background
        const statsX = width - 240;
        const statsWidth = 220;
        const statsHeight = 40;
        const statsY = y - statsHeight / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(statsX, statsY, statsWidth, statsHeight, 20);
        ctx.fill();

        ctx.fillStyle = rankColor;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`LVL ${e.level}`, statsX + statsWidth - 15, y);

        ctx.fillStyle = '#b9bbbe';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.floor(e.xp).toLocaleString()} XP`, statsX + 15, y);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    renderControlPanelImage,
    renderStatsCard,
    renderLeaderboard
};
