/**
 * 钉钉 Webhook 机器人推送工具
 * 使用 ActionCard 富文本卡片格式
 */

/**
 * 发送钉钉 Webhook 通知（ActionCard 卡片格式）
 * @param {Object} env - Worker 环境变量
 * @param {string} title - 标题
 * @param {string} content - 短信内容
 * @param {string} device - 来源设备
 * @param {string} code - 验证码（可选）
 * @returns {Promise<Object>} 推送结果
 */
export async function sendDingtalkNotification(env, title, content, device, code = null) {
    const webhookUrl = env.DINGTALK_WEBHOOK;

    if (!webhookUrl) {
        console.warn('No DingTalk webhook configured');
        return { success: false, error: 'No DingTalk webhook configured' };
    }

    try {
        const url = new URL(webhookUrl);

        if (env.DINGTALK_SECRET) {
            const timestamp = Date.now();
            const sign = await signDingtalk(env.DINGTALK_SECRET, timestamp);
            url.searchParams.set('timestamp', String(timestamp));
            url.searchParams.set('sign', sign);
        }

        const markdown = buildDingtalkMarkdown(title, content, device, code);
        const payload = {
            msgtype: 'actionCard',
            actionCard: {
                title: title,
                text: markdown,
                hideAvatar: '0',
                btnOrientation: '0',
                singleTitle: '查看详情',
                singleURL: 'dingtalk://dingtalkclient/action/openapp',
            },
        };

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SMS-Forwarder-Worker/1.0',
            },
            body: JSON.stringify(payload),
        });

        const result = await safeJson(response);

        if (response.ok && result.errcode === 0) {
            console.log('DingTalk push success');
            return { success: true };
        }

        const errorMsg = result.errmsg || result.msg || 'Unknown error';
        console.error(`DingTalk push failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    } catch (error) {
        console.error(`DingTalk push error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * 构建钉钉 Markdown 消息内容
 * @param {string} title - 标题
 * @param {string} content - 短信内容
 * @param {string} device - 来源设备
 * @param {string} code - 验证码（可选）
 * @returns {string} Markdown 格式文本
 */
function buildDingtalkMarkdown(title, content, device, code) {
    const lines = [];

    // 标题
    lines.push(`### ${title}`);
    lines.push('');

    // 验证码高亮（钉钉支持基础 Markdown）
    if (code) {
        lines.push(`> **🔐 验证码: \`${code}\`**`);
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // 短信内容
    lines.push(`**📝 短信内容**`);
    lines.push('');
    lines.push(`> ${escapeDingtalkMarkdown(content)}`);
    lines.push('');

    // 来源设备
    if (device && device !== 'unknown') {
        lines.push(`📱 **来自**: ${device}`);
        lines.push('');
    }

    // 时间戳
    lines.push(`🕐 **时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

    return lines.join('\n');
}

/**
 * 转义钉钉 Markdown 特殊字符
 */
function escapeDingtalkMarkdown(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_');
}

async function signDingtalk(secret, timestamp) {
    const encoder = new TextEncoder();
    const trimmedSecret = String(secret || '').trim();
    const stringToSign = `${timestamp}\n${trimmedSecret}`;

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(trimmedSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
    return arrayBufferToBase64(signature);
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function safeJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}
