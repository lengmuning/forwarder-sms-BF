/**
 * 请求验证工具
 */

// 验证码正则模式（支持多种格式）
const CODE_PATTERNS = [
    /(?:验证码|校验码|确认码|动态码|安全码|code)[是为：:\s]*(\d{4,8})/i,
    /(\d{4,8})(?:\s*(?:是|为)?(?:您的)?(?:验证码|校验码|确认码|动态码|安全码))/i,
    /(?:code|verification|verify)[:\s]*(\d{4,8})/i,
    /\b(\d{6})\b/, // 独立的6位数字（最常见的验证码长度）
    /\b(\d{4})\b/, // 独立的4位数字
];

/**
 * 验证 Bearer Token
 */
export function validateToken(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { valid: false, error: 'Missing Authorization header' };
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
        return { valid: false, error: 'Invalid Authorization format' };
    }

    if (token !== env.API_TOKEN) {
        return { valid: false, error: 'Invalid token' };
    }

    return { valid: true };
}

/**
 * 验证请求体
 */
export function validateBody(body) {
    if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Invalid request body' };
    }

    const content = String(body.content || '').trim();
    if (!content) {
        return { valid: false, error: 'Missing or invalid content field' };
    }

    if (content.length > 1000) {
        return { valid: false, error: 'Content too long' };
    }

    return { valid: true };
}

/**
 * 验证时间戳（偏差不超过5分钟）
 */
export function validateTimestamp(timestamp) {
    if (!timestamp) {
        return { valid: true }; // 时间戳可选
    }

    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - timestamp);
    const maxDiff = 5 * 60; // 5分钟

    if (diff > maxDiff) {
        return { valid: false, error: `Timestamp drift too large: ${diff}s` };
    }

    return { valid: true };
}

/**
 * 从短信内容中提取验证码
 */
export function extractCode(content) {
    for (const pattern of CODE_PATTERNS) {
        const match = content.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

/**
 * 检查是否为验证码短信
 */
export function isVerificationSms(content) {
    const keywords = [
        '验证码', '校验码', '确认码', '动态码', '安全码',
        'code', 'verification', 'verify', 'otp', 'pin',
    ];
    const lowerContent = content.toLowerCase();
    return keywords.some(keyword => lowerContent.includes(keyword));
}
