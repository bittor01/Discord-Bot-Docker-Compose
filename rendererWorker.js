/**
 * rendererWorker.js
 */

// Import required modules for worker thread operation and canvas rendering.
const { parentPort, workerData } = require('worker_threads');
// Import the canvas renderer module.
const renderer = require('./renderer');

// Asynchronously process incoming render tasks sent from the main process thread.
async function processTask(task) {
    // Extract task type and payload data from the received task object.
    const { type, data } = task;
    try {
        // Initialize image buffer variable.
        let buffer;
        // Check task type and delegate to appropriate renderer function.
        if (type === 'controlPanel') {
            buffer = await renderer.renderControlPanelImage(data);
        } else if (type === 'statsCard') {
            buffer = await renderer.renderStatsCard(data);
        } else if (type === 'leaderboard') {
            buffer = await renderer.renderLeaderboard(data);
        }
        // Send back the generated image buffer with success status.
        parentPort.postMessage({ status: 'success', buffer });
    } catch (error) {
        // Send back error status and message if rendering encounters an exception.
        parentPort.postMessage({ status: 'error', error: error.message });
    }
}

// Ensure parentPort exists before attaching event listener to prevent errors when loaded in main thread.
if (parentPort) {
    // Listen for incoming rendering messages from the parent thread.
    parentPort.on('message', (task) => {
        // Process the task upon receiving a message.
        processTask(task);
    });
}
