/**
 * Bark 推送工具
 */

/**
 * 发送 Bark 推送通知
 * @param {Object} env - Worker 环境变量
 * @param {string} title - 推送标题
 * @param {string} body - 推送内容
 * @param {string[]} targetKeys - 指定的 Bark keys（可选）
 * @returns {Promise<Object>} 推送结果
 */
export async function sendBarkNotification(env, title, body, targetKeys = null) {
    const barkServer = env.BARK_SERVER || 'https://api.day.app';

    // 获取目标设备 keys
    let keys = targetKeys;
    if (!keys || keys.length === 0) {
        // 使用环境变量中配置的所有 keys
        const keysStr = env.BARK_KEYS || '';
        keys = keysStr.split(',').map(k => k.trim()).filter(k => k);
    }

    if (keys.length === 0) {
        console.warn('No Bark keys configured');
        return { success: false, error: 'No Bark keys configured' };
    }

    const results = [];
    const errors = [];

    // 并行推送到所有设备
    await Promise.all(keys.map(async (key) => {
        try {
            const url = new URL(`/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`, barkServer);
            url.searchParams.set('group', 'sms');
            url.searchParams.set('isArchive', '1');
            url.searchParams.set('sound', 'shake'); // 震动提醒

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: { 'User-Agent': 'SMS-Forwarder-Worker/1.0' },
            });

            if (response.ok) {
                results.push({ key: maskKey(key), success: true });
                console.log(`Bark push success: ${maskKey(key)}`);
            } else {
                const text = await response.text();
                errors.push({ key: maskKey(key), error: text });
                console.error(`Bark push failed: ${maskKey(key)} - ${text}`);
            }
        } catch (error) {
            errors.push({ key: maskKey(key), error: error.message });
            console.error(`Bark push error: ${maskKey(key)} - ${error.message}`);
        }
    }));

    return {
        success: results.length > 0,
        pushed: results.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
    };
}

/**
 * 构建推送内容
 * @param {string} code - 验证码
 * @param {string} content - 原始短信内容
 * @param {string} device - 来源设备
 * @returns {Object} { title, body }
 */
export function buildNotificationContent(code, content, device) {
    const title = '📩 短信验证码';

    let body = '';
    if (code) {
        body = `${code}\n────────────\n${content}`;
    } else {
        body = content;
    }

    if (device) {
        body += `\n\n📱 来自: ${device}`;
    }

    return { title, body };
}

/**
 * 隐藏 key 的中间部分
 */
function maskKey(key) {
    if (key.length <= 8) return '***';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
