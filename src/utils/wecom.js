/**
 * 企业微信 Webhook 机器人推送工具
 * 使用 Markdown 富文本格式
 */

/**
 * 发送企业微信 Webhook 通知（Markdown 格式）
 * @param {Object} env - Worker 环境变量
 * @param {string} title - 标题
 * @param {string} content - 短信内容
 * @param {string} device - 来源设备
 * @param {string} code - 验证码（可选）
 * @returns {Promise<Object>} 推送结果
 */
export async function sendWecomNotification(env, title, content, device, code = null) {
    const webhookUrl = env.WECOM_WEBHOOK;

    if (!webhookUrl) {
        console.warn('No WeCom webhook configured');
        return { success: false, error: 'No WeCom webhook configured' };
    }

    try {
        const markdown = buildWecomMarkdown(title, content, device, code);
        const payload = {
            msgtype: 'markdown',
            markdown: { content: markdown },
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SMS-Forwarder-Worker/1.0',
            },
            body: JSON.stringify(payload),
        });

        const result = await safeJson(response);

        if (response.ok && result.errcode === 0) {
            console.log('WeCom push success');
            return { success: true };
        }

        const errorMsg = result.errmsg || result.msg || 'Unknown error';
        console.error(`WeCom push failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    } catch (error) {
        console.error(`WeCom push error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * 构建企业微信 Markdown 消息
 * @param {string} title - 标题
 * @param {string} content - 短信内容
 * @param {string} device - 来源设备
 * @param {string} code - 验证码（可选）
 * @returns {string} Markdown 格式文本
 */
function buildWecomMarkdown(title, content, device, code) {
    const lines = [];

    // 标题
    lines.push(`### ${title}`);

    // 验证码高亮（企业微信支持 info/comment/warning 颜色标记）
    if (code) {
        lines.push(`> **🔐 验证码: <font color="warning">${code}</font>**`);
        lines.push('');
    }

    // 短信内容
    lines.push(`**📝 短信内容**`);
    lines.push(`> ${escapeWecomMarkdown(content)}`);
    lines.push('');

    // 来源设备
    if (device && device !== 'unknown') {
        lines.push(`📱 **来自**: ${device}`);
    }

    // 时间戳
    lines.push(`🕐 **时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

    return lines.join('\n');
}

/**
 * 转义企业微信 Markdown 特殊字符
 */
function escapeWecomMarkdown(text) {
    return text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function safeJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}
