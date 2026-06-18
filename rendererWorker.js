/**
 * rendererWorker.js
 * Worker thread for offloading Canvas rendering tasks.
 */

const { parentPort, workerData } = require('worker_threads');
const renderer = require('./renderer');

async function processTask(task) {
    const { type, data } = task;

    try {
        let buffer;
        if (type === 'controlPanel') {
            buffer = await renderer.renderControlPanelImage(data);
        } else if (type === 'statsCard') {
            buffer = await renderer.renderStatsCard(data);
        }

        parentPort.postMessage({ status: 'success', buffer });
    } catch (error) {
        parentPort.postMessage({ status: 'error', error: error.message });
    }
}

parentPort.on('message', (task) => {
    processTask(task);
});
