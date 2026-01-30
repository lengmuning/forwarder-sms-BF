/**
 * 基于 KV 的速率限制工具
 */

/**
 * 检查并更新速率限制
 * @param {Object} env - Worker 环境变量 (包含 SMS_CACHE KV)
 * @param {string} identifier - 速率限制标识
 * @returns {Promise<Object>} { allowed: boolean, remaining: number, error?: string }
 */
export async function checkRateLimit(env, identifier) {
    const maxRequests = parseInt(env.RATE_LIMIT) || 10;
    const windowSeconds = 60; // 1分钟窗口

    const safeId = String(identifier || 'unknown').slice(0, 128);
    const key = `rate:${safeId}:${getMinuteKey()}`;

    try {
        const currentStr = await env.SMS_CACHE.get(key);
        const current = parseInt(currentStr) || 0;

        if (current >= maxRequests) {
            console.log(`Rate limit exceeded for identifier: ${safeId}`);
            return {
                allowed: false,
                remaining: 0,
                error: `Rate limit exceeded. Max ${maxRequests} requests per minute.`,
            };
        }

        // 更新计数
        await env.SMS_CACHE.put(key, String(current + 1), {
            expirationTtl: windowSeconds,
        });

        return {
            allowed: true,
            remaining: maxRequests - current - 1,
        };
    } catch (error) {
        console.error('Rate limit check error:', error);
        // 发生错误时允许通过，避免阻塞正常请求
        return { allowed: true, remaining: maxRequests };
    }
}

/**
 * 获取当前分钟的 key（用于速率限制窗口）
 */
function getMinuteKey() {
    return Math.floor(Date.now() / 60000);
}
