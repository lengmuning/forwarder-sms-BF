# SMS Forwarder - 短信转发统一接口

🚀 基于 Cloudflare Worker 的**通用短信转发网关**，提供统一 REST API 接口，将短信/验证码转发到 Bark / 飞书 / 企业微信 / 钉钉等多种推送渠道。

**支持接入任何能发送 HTTP 请求的设备**，包括但不限于：
- 📱 **iOS** - 通过快捷指令自动化
- 🤖 **Android** - 通过 Tasker / MacroDroid / SmsForwarder 等应用
- 🏭 **工业 4G 网关** - 通过 HTTP 回调接口
- 🖥️ **服务器/NAS** - 通过脚本或定时任务
- 🔌 **物联网设备** - 任何支持 HTTP POST 的设备

## 功能特性

- ✅ 统一 REST API 接口（POST JSON）
- ✅ Bearer Token 鉴权
- ✅ 自动提取验证码（支持多种格式）
- ✅ KV 去重（基于设备 + 内容，防止重复推送）
- ✅ 多设备推送支持
- ✅ 速率限制（优先设备标识，缺省回退 IP）
- ✅ 调试模式
- ✅ 飞书自定义机器人 Webhook 推送
- ✅ 企业微信群机器人 Webhook 推送（Markdown 富文本）
- ✅ 钉钉自定义机器人 Webhook 推送（ActionCard 卡片）
- ✅ 支持所有短信推送（不限验证码）

---

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 KV Namespace

```bash
npx wrangler kv:namespace create SMS_CACHE
```

将输出的 `id` 填入 `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SMS_CACHE"
id = "你的 KV namespace id"
```

### 3. 配置 Secrets

```bash
# API 访问令牌
npx wrangler secret put API_TOKEN
# 输入你的 token，例如: my-secret-token-12345

# Bark 设备 Key（多个用逗号分隔，可选）
npx wrangler secret put BARK_KEYS
# 输入你的 Bark keys，例如: key1,key2,key3

# 飞书自定义机器人 Webhook URL
npx wrangler secret put FEISHU_WEBHOOK
# 输入你的飞书 Webhook URL，例如: https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx

# 企业微信群机器人 Webhook URL
npx wrangler secret put WECOM_WEBHOOK
# 输入你的企业微信 Webhook URL，例如: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx

# 钉钉自定义机器人 Webhook URL
npx wrangler secret put DINGTALK_WEBHOOK
# 输入你的钉钉 Webhook URL，例如: https://oapi.dingtalk.com/robot/send?access_token=xxxxx

# 钉钉机器人加签密钥（可选）
npx wrangler secret put DINGTALK_SECRET
# 输入你的钉钉加签密钥（没有则可跳过）
```

### 4. 部署

```bash
npm run deploy
```

---

## API 接口

### POST `/api/sms/forward`

**Headers:**
```
Authorization: Bearer <your-api-token>
Content-Type: application/json
```

**Body:**
```json
{
  "device": "iphone-main",
  "content": "您的验证码是 834921，有效期5分钟",
  "code": "834921",
  "timestamp": 1737820000,
  "target": ["bark-key-1"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | ✅ | 短信内容 |
| device | string | ❌ | 来源设备标识（用于去重与限流） |
| code | string | ❌ | 验证码（不传则自动提取） |
| timestamp | number | ❌ | Unix 时间戳（偏差>5分钟拒绝） |
| target | string[] | ❌ | 指定推送的 Bark keys |

**Response:**
```json
{
  "success": true,
  "message": "forwarded",
  "code": "834921",
  "feishu": true,
  "wecom": false,
  "dingtalk": false,
  "bark": 2
}
```

---

## 设备接入示例

### iOS 快捷指令

1. 创建新的快捷指令
2. 添加「自动化」触发器 → 当收到短信时
3. 添加以下操作:

```
获取短信内容 → 变量：消息

获取 URL 的内容
  URL: https://your-worker.workers.dev/api/sms/forward
  方法: POST
  Headers:
    Authorization: Bearer your-api-token
    Content-Type: application/json
  Body: {
    "device": "我的iPhone",
    "content": [消息内容],
    "timestamp": [当前日期的Unix时间戳]
  }
```

### Android（SmsForwarder / Tasker）

推荐使用开源应用 [SmsForwarder](https://github.com/pppscn/SmsForwarder)，配置 Webhook 转发：

- **Webhook URL**: `https://your-worker.workers.dev/api/sms/forward`
- **请求方法**: POST
- **请求头**:
  ```
  Authorization: Bearer your-api-token
  Content-Type: application/json
  ```
- **请求体**:
  ```json
  {
    "device": "Android-设备名",
    "content": "[msg]",
    "timestamp": [timestamp]
  }
  ```

### 工业 4G 网关 / 物联网设备

配置 HTTP 回调地址，发送 POST 请求：

```bash
curl -X POST "https://your-worker.workers.dev/api/sms/forward" \
  -H "Authorization: Bearer your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "device": "4G-Gateway-01",
    "content": "您的验证码是 123456",
    "timestamp": 1737820000
  }'
```

### 通用脚本（Python 示例）

```python
import requests
import time

response = requests.post(
    "https://your-worker.workers.dev/api/sms/forward",
    headers={
        "Authorization": "Bearer your-api-token",
        "Content-Type": "application/json"
    },
    json={
        "device": "Server-01",
        "content": "您的验证码是 654321",
        "timestamp": int(time.time())
    }
)
print(response.json())
```

---

## 调试模式

添加 `?debug=true` 参数，只写入 KV 缓存，不发送任何推送:

```bash
curl -X POST "https://your-worker.workers.dev/api/sms/forward?debug=true" \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"content":"验证码 123456"}'
```

---

## 本地开发

```bash
# 启动开发服务器
npm run dev

# 测试请求
curl -X POST http://localhost:8787/api/sms/forward \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"content":"您的验证码是 654321","device":"test"}'
```

---

## 环境变量

| 变量 | 类型 | 说明 |
|------|------|------|
| API_TOKEN | Secret | API 访问令牌 |
| BARK_KEYS | Secret | Bark 设备 Keys（逗号分隔） |
| BARK_SERVER | Var | Bark 服务器地址（默认: https://api.day.app） |
| RATE_LIMIT | Var | 每分钟最大请求数（默认: 10） |
| DEBUG | Var | 调试模式（默认: false） |
| FEISHU_WEBHOOK | Secret | 飞书自定义机器人 Webhook URL |
| WECOM_WEBHOOK | Secret | 企业微信群机器人 Webhook URL |
| DINGTALK_WEBHOOK | Secret | 钉钉自定义机器人 Webhook URL |
| DINGTALK_SECRET | Secret | 钉钉机器人加签密钥（可选） |

## 去重与限流说明

- 去重基于 `device + content` 计算哈希；未提供 device 时仅使用 content。
- 速率限制优先使用 device；未提供 device 时回退到客户端 IP。

---

## 飞书自定义机器人配置

1. 在飞书群聊中添加自定义机器人
2. 复制 Webhook 地址（格式: `https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx`）
3. 运行以下命令配置:

```bash
npx wrangler secret put FEISHU_WEBHOOK
# 粘贴你的 Webhook URL
```

简单短信会以卡片消息格式推送，包含:
- 验证码高亮显示（如果有）
- 短信完整内容
- 来源设备信息
- 接收时间

---

## 企业微信群机器人配置（Markdown 格式）

1. 在企业微信群聊中添加群机器人
2. 复制 Webhook 地址（格式: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx`）
3. 运行以下命令配置:

```bash
npx wrangler secret put WECOM_WEBHOOK
# 粘贴你的企业微信 Webhook URL
```

消息以 Markdown 富文本格式推送，包含:
- 验证码高亮显示（警告色）
- 短信内容引用块
- 来源设备信息
- 接收时间

---

## 钉钉自定义机器人配置（ActionCard 卡片）

1. 在钉钉群聊中添加自定义机器人
2. 复制 Webhook 地址（格式: `https://oapi.dingtalk.com/robot/send?access_token=xxxxx`）
3. 如需“加签”安全设置，请同时保存加签密钥
4. 运行以下命令配置:

```bash
npx wrangler secret put DINGTALK_WEBHOOK
# 粘贴你的钉钉 Webhook URL

# 如需加签
npx wrangler secret put DINGTALK_SECRET
```

消息以 ActionCard 卡片格式推送，包含:
- 验证码代码块高亮
- 短信内容引用块
- 来源设备信息
- 接收时间
- 可点击卡片按钮

---

## License

MIT
