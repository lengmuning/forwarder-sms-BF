#!/usr/bin/env node

/**
 * 微信 ilinkai Bot 配置脚本
 * 用途：扫码登录获取 bot_token，然后等待目标用户发消息获取 user_id
 *
 * 使用方式：node scripts/weixin-setup.mjs
 */

const BASE_URL = 'https://ilinkai.weixin.qq.com';

function makeHeaders(botToken = null) {
    const uin = btoa(String(Math.floor(Math.random() * 4294967296)));
    const headers = {
        'Content-Type': 'application/json',
        'AuthorizationType': 'ilink_bot_token',
        'X-WECHAT-UIN': uin,
    };
    if (botToken) {
        headers['Authorization'] = `Bearer ${botToken}`;
    }
    return headers;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== 第一步：获取二维码 ==========

async function getQrCode() {
    console.log('正在获取登录二维码...\n');

    const res = await fetch(`${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, {
        headers: makeHeaders(),
    });
    const data = await res.json();

    if (!data.qrcode) {
        console.error('获取二维码失败:', JSON.stringify(data, null, 2));
        process.exit(1);
    }

    // qrcode_img_content 是扫码链接（不是 base64 图片）
    if (data.qrcode_img_content) {
        console.log('请在浏览器中打开以下链接，用微信扫码登录:\n');
        console.log(`  ${data.qrcode_img_content}\n`);
    } else {
        console.log('请用微信扫描以下二维码:');
        console.log(data.qrcode);
    }

    return data.qrcode;
}

// ========== 第二步：轮询扫码状态 ==========

async function waitForLogin(qrcode) {
    console.log('\n等待扫码确认...');

    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(
                `${BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
                { headers: makeHeaders() }
            );
            const data = await res.json();

            if (data.status === 'confirmed' && data.bot_token) {
                console.log('\n登录成功!\n');
                console.log('='.repeat(50));
                console.log(`WEIXIN_BOT_TOKEN = ${data.bot_token}`);
                if (data.baseurl) {
                    console.log(`WEIXIN_BASE_URL  = ${data.baseurl}`);
                }
                console.log('='.repeat(50));
                return { botToken: data.bot_token, baseUrl: data.baseurl };
            }

            if (data.status === 'expired') {
                console.error('\n二维码已过期，请重新运行脚本');
                process.exit(1);
            }

            process.stdout.write('.');
        } catch (e) {
            // 长轮询超时是正常的，继续重试
        }

        await sleep(2000);
    }

    console.error('\n等待超时，请重新运行脚本');
    process.exit(1);
}

// ========== 第三步：等待目标用户发消息 ==========

async function waitForMessage(botToken) {
    console.log('\n现在请用 目标微信账号 给 Bot 发送一条任意消息...');
    console.log('(等待中，最多 3 分钟)\n');

    let cursor = '';

    for (let i = 0; i < 10; i++) {
        try {
            const body = {
                get_updates_buf: cursor,
                base_info: { channel_version: '1.0.2' },
            };

            const res = await fetch(`${BASE_URL}/ilink/bot/getupdates`, {
                method: 'POST',
                headers: makeHeaders(botToken),
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.get_updates_buf) {
                cursor = data.get_updates_buf;
            }

            if (data.msgs && data.msgs.length > 0) {
                const msg = data.msgs[0];
                const userId = msg.from_user_id;

                console.log('收到消息!\n');
                console.log('='.repeat(50));
                console.log(`WEIXIN_TARGET_USER = ${userId}`);
                console.log('='.repeat(50));

                // 显示消息内容（如果有）
                if (msg.item_list && msg.item_list[0]?.text_item?.text) {
                    console.log(`\n消息内容: "${msg.item_list[0].text_item.text}"`);
                }

                return userId;
            }

            process.stdout.write('.');
        } catch (e) {
            // 长轮询超时正常
        }
    }

    console.error('\n等待消息超时。你可以稍后手动调用 getupdates 接口获取 user_id');
    process.exit(1);
}

// ========== 主流程 ==========

async function main() {
    console.log('====================================');
    console.log('  微信 ilinkai Bot 配置工具');
    console.log('====================================\n');

    // 第一步
    const qrcode = await getQrCode();

    // 第二步
    const { botToken } = await waitForLogin(qrcode);

    // 第三步
    const targetUser = await waitForMessage(botToken);

    // 最终输出
    console.log('\n\n====================================');
    console.log('  配置完成! 请运行以下命令:');
    console.log('====================================\n');
    console.log(`npx wrangler secret put WEIXIN_BOT_TOKEN`);
    console.log(`  输入: ${botToken}\n`);
    console.log(`npx wrangler secret put WEIXIN_TARGET_USER`);
    console.log(`  输入: ${targetUser}\n`);

}

main().catch(err => {
    console.error('出错:', err.message);
    process.exit(1);
});
