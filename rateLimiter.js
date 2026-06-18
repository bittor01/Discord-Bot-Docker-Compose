/**
 * rateLimiter.js
 * Implements a Leaky Bucket rate limiter for Discord API calls with retry logic.
 */

class RateLimiter {
    constructor(maxPerSecond) {
        this.capacity = maxPerSecond;
        this.tokens = maxPerSecond;
        this.queue = [];
        this.lastRefill = Date.now();

        // Start the refill interval
        setInterval(() => this.refill(), 100);
    }

    refill() {
        const now = Date.now();
        const delta = now - this.lastRefill;
        this.tokens = Math.min(this.capacity, this.tokens + (delta * (this.capacity / 1000)));
        this.lastRefill = now;
        this.processQueue();
    }

    async processQueue() {
        while (this.queue.length > 0 && this.tokens >= 1) {
            const { resolve, reject, task, attempts } = this.queue.shift();
            this.tokens -= 1;
            try {
                const result = await task();
                resolve(result);
            } catch (error) {
                // If it's a timeout error and we haven't exhausted retries, put it back in queue
                if (error.code === 'UND_ERR_CONNECT_TIMEOUT' && attempts < 3) {
                    console.warn(`API call timed out, retrying (attempt ${attempts + 1})...`);
                    this.queue.push({ resolve, reject, task, attempts: attempts + 1 });
                } else {
                    // Task failed, but we still consumed a token for the attempt
                    reject(error);
                }
            }
        }
    }

    /**
     * Wrap a function call with the rate limiter
     * @param {Function} task A function that returns a Promise
     */
    async execute(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject, task, attempts: 0 });
            this.processQueue();
        });
    }
}

// Global instance
const limiter = new RateLimiter(parseInt(process.env.MAX_API_CALLS_PER_SECOND) || 25);

module.exports = limiter;
