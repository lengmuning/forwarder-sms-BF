/**
 * 飞书 Webhook 机器人推送工具
 */

/**
 * 发送飞书 Webhook 通知
 * @param {Object} env - Worker 环境变量
 * @param {string} title - 推送标题
 * @param {string} content - 短信内容
 * @param {string} device - 来源设备
 * @param {string} code - 验证码（可选）
 * @returns {Promise<Object>} 推送结果
 */
export async function sendFeishuNotification(env, title, content, device, code = null) {
    const webhookUrl = env.FEISHU_WEBHOOK;

    if (!webhookUrl) {
        console.warn('No Feishu webhook configured');
        return { success: false, error: 'No Feishu webhook configured' };
    }

    try {
        const card = buildFeishuCard(title, content, device, code);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SMS-Forwarder-Worker/1.0',
            },
            body: JSON.stringify(card),
        });

        const result = await response.json();

        if (response.ok && result.code === 0) {
            console.log('Feishu push success');
            return { success: true };
        } else {
            const errorMsg = result.msg || result.message || 'Unknown error';
            console.error(`Feishu push failed: ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
    } catch (error) {
        console.error(`Feishu push error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * 构建飞书卡片消息
 * @param {string} title - 标题
 * @param {string} content - 短信内容
 * @param {string} device - 来源设备
 * @param {string} code - 验证码（可选）
 * @returns {Object} 飞书卡片消息格式
 */
export function buildFeishuCard(title, content, device, code = null) {
    const elements = [];

    // 如果有验证码，突出显示
    if (code) {
        elements.push({
            tag: 'div',
            text: {
                tag: 'lark_md',
                content: `**🔐 验证码: \`${code}\`**`,
            },
        });
        elements.push({
            tag: 'hr',
        });
    }

    // 短信内容
    elements.push({
        tag: 'div',
        text: {
            tag: 'lark_md',
            content: `📝 **短信内容**\n${escapeMarkdown(content)}`,
        },
    });

    // 来源设备
    if (device) {
        elements.push({
            tag: 'note',
            elements: [
                {
                    tag: 'plain_text',
                    content: `📱 来自: ${device}`,
                },
            ],
        });
    }

    // 时间戳
    elements.push({
        tag: 'note',
        elements: [
            {
                tag: 'plain_text',
                content: `🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
            },
        ],
    });

    return {
        msg_type: 'interactive',
        card: {
            header: {
                title: {
                    tag: 'plain_text',
                    content: title,
                },
                template: code ? 'blue' : 'turquoise',
            },
            elements,
        },
    };
}

/**
 * 转义 Markdown 特殊字符
 */
function escapeMarkdown(text) {
    // 飞书 lark_md 格式需要转义的字符较少
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/`/g, '\\`');
}
