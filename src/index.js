/**
 * SMS Forwarder Cloudflare Worker
 * 接收 iOS 快捷指令的短信验证码，通过 Bark 推送到指定设备
 */

import { handleSmsForward } from './handlers/sms.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 路由分发
    try {
      // 健康检查
      if (path === '/health' && request.method === 'GET') {
        return jsonResponse({ status: 'ok', timestamp: Date.now() });
      }

      // SMS 转发接口
      if (path === '/api/sms/forward' && request.method === 'POST') {
        return await handleSmsForward(request, env, url);
      }

      // 404
      return jsonResponse({ success: false, message: 'Not Found' }, 404);
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ success: false, message: 'Internal Server Error' }, 500);
    }
  },
};

/**
 * JSON 响应辅助函数
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
