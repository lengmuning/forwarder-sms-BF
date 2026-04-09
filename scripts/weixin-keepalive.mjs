#!/usr/bin/env node

/**
 * 微信 ilinkai Bot Token 保活脚本
 * 通过持续长轮询 getupdates 保持 session 在线
 *
 * 用法:
 *   WEIXIN_BOT_TOKEN="your_token" node weixin-keepalive.mjs
 *
 * 或配合 systemd 使用（见下方说明）
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── 配置 ──────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.WEIXIN_BOT_TOKEN;
const BASE_URL = process.env.WEIXIN_BASE_URL || 'https://ilinkai.weixin.qq.com';
const STATE_FILE = process.env.WEIXIN_STATE_FILE || path.join(process.env.HOME || '/tmp', '.weixin-keepalive.json');

if (!BOT_TOKEN) {
    console.error('错误: 请设置 WEIXIN_BOT_TOKEN 环境变量');
    console.error('用法: WEIXIN_BOT_TOKEN="your_token" node weixin-keepalive.mjs');
    process.exit(1);
}

// ── 状态持久化 ────────────────────────────────────────────────────────────

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch {}
    return { get_updates_buf: '', stats: { startedAt: null, polls: 0, errors: 0 } };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
        console.error(`[${ts()}] 保存状态失败: ${err.message}`);
    }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function ts() {
    return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function randomUin() {
    const uint32 = crypto.randomBytes(4).readUInt32BE(0);
    return Buffer.from(String(uint32)).toString('base64');
}

// ── 长轮询主循环 ──────────────────────────────────────────────────────────

const POLL_TIMEOUT_MS = 40_000;     // 客户端超时（略大于服务端 35 秒）
const RETRY_DELAY_MS = 5_000;       // 普通错误重试间隔
const BACKOFF_DELAY_MS = 30_000;    // 连续失败退避间隔
const MAX_CONSECUTIVE_FAILURES = 5;
const SESSION_PAUSE_MS = 60 * 60 * 1000; // session 过期暂停 1 小时

async function poll(state) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

    try {
        const res = await fetch(`${BASE_URL}/ilink/bot/getupdates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'AuthorizationType': 'ilink_bot_token',
                'X-WECHAT-UIN': randomUin(),
                'Authorization': `Bearer ${BOT_TOKEN}`,
            },
            body: JSON.stringify({
                get_updates_buf: state.get_updates_buf || '',
                base_info: { channel_version: '1.0.2' },
            }),
            signal: controller.signal,
        });

        clearTimeout(timer);
        const data = await res.json();
        return data;
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            // 长轮询超时是正常的
            return { ret: 0, msgs: [], get_updates_buf: state.get_updates_buf };
        }
        throw err;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const state = loadState();
    state.stats.startedAt = ts();
    state.stats.polls = state.stats.polls || 0;
    state.stats.errors = state.stats.errors || 0;

    console.log(`[${ts()}] 微信保活脚本启动`);
    console.log(`[${ts()}] BASE_URL: ${BASE_URL}`);
    console.log(`[${ts()}] TOKEN: ${BOT_TOKEN.slice(0, 12)}...${BOT_TOKEN.slice(-6)}`);
    console.log(`[${ts()}] 状态文件: ${STATE_FILE}`);

    if (state.get_updates_buf) {
        console.log(`[${ts()}] 恢复上次游标 (${state.get_updates_buf.length} bytes)`);
    }

    let consecutiveFailures = 0;

    // 优雅退出
    const shutdown = () => {
        console.log(`\n[${ts()}] 收到退出信号，保存状态...`);
        saveState(state);
        console.log(`[${ts()}] 统计: 轮询 ${state.stats.polls} 次, 错误 ${state.stats.errors} 次`);
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (true) {
        try {
            const data = await poll(state);
            state.stats.polls++;

            // 检查错误
            const isError = (data.ret !== undefined && data.ret !== 0) ||
                            (data.errcode !== undefined && data.errcode !== 0);

            if (isError) {
                const code = data.errcode || data.ret;

                // session 过期 (errcode -14)
                if (code === -14) {
                    console.error(`[${ts()}] ⚠️  Session 过期 (errcode=${code})，暂停 1 小时`);
                    console.error(`[${ts()}] 如果持续出现此错误，需要重新扫码获取 token`);
                    state.stats.errors++;
                    saveState(state);
                    await sleep(SESSION_PAUSE_MS);
                    consecutiveFailures = 0;
                    continue;
                }

                consecutiveFailures++;
                state.stats.errors++;
                console.error(`[${ts()}] 轮询失败: ret=${data.ret} errcode=${data.errcode} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);

                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.error(`[${ts()}] 连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，退避 ${BACKOFF_DELAY_MS / 1000}s`);
                    consecutiveFailures = 0;
                    saveState(state);
                    await sleep(BACKOFF_DELAY_MS);
                } else {
                    await sleep(RETRY_DELAY_MS);
                }
                continue;
            }

            // 成功
            consecutiveFailures = 0;

            // 更新游标
            if (data.get_updates_buf) {
                state.get_updates_buf = data.get_updates_buf;
            }

            // 收到消息时打日志（不处理，只记录）
            const msgs = data.msgs || [];
            if (msgs.length > 0) {
                for (const msg of msgs) {
                    const text = msg.item_list?.[0]?.text_item?.text || '[非文本]';
                    console.log(`[${ts()}] 收到消息: from=${msg.from_user_id} "${text.slice(0, 50)}"`);
                }
            }

            // 每 100 次轮询保存一次状态
            if (state.stats.polls % 100 === 0) {
                saveState(state);
                console.log(`[${ts()}] 运行正常 | 轮询: ${state.stats.polls} | 错误: ${state.stats.errors}`);
            }

        } catch (err) {
            consecutiveFailures++;
            state.stats.errors++;
            console.error(`[${ts()}] 网络错误: ${err.message} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);

            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error(`[${ts()}] 连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，退避 ${BACKOFF_DELAY_MS / 1000}s`);
                consecutiveFailures = 0;
                saveState(state);
                await sleep(BACKOFF_DELAY_MS);
            } else {
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
}

main().catch(err => {
    console.error(`[${ts()}] 致命错误: ${err.message}`);
    process.exit(1);
});
