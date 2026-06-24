/**
 * renderer.js
 */

const { createCanvas, registerFont, loadImage } = require('canvas');

async function renderControlPanelImage(members) {
    const width = 600;
    const rowHeight = 40;
    const height = Math.max(100, members.length * rowHeight + 40);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Member Status & Acclimation', 20, 30);
    members.forEach((m, i) => {
        const y = 60 + i * rowHeight;
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(m.name.substring(0, 15), 20, y);
        ctx.fillStyle = '#4f545c';
        ctx.fillRect(150, y - 12, 300, 15);
        const gradient = ctx.createLinearGradient(150, 0, 450, 0);
        gradient.addColorStop(0, '#43b581');
        gradient.addColorStop(1, '#3ca374');
        ctx.fillStyle = gradient;
        ctx.fillRect(150, y - 12, 300 * m.acclimation, 15);
        ctx.fillStyle = '#b9bbbe';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${(m.multiplier || 1).toFixed(2)}x`, 460, y);
        if (m.isSharing) {
            ctx.fillStyle = '#ff73fa';
            ctx.fillText('📺', 520, y);
        }
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
