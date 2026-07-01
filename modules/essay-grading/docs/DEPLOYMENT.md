# Deployment

## Vercel（推荐 · 全栈）

门户、批改 UI 与 API 均部署在 Vercel。批改采用 **分步 Serverless API**（Hobby 10s 超时友好），会话状态存 **Upstash Redis**（Vercel Marketplace 集成；本地无 Redis 时自动用内存）。

### 前置条件

1. [Vercel](https://vercel.com) 账号，GitHub 仓库已连接
2. Vercel Dashboard → **Marketplace** → 安装 **Upstash Redis**，绑定到项目（自动注入 `KV_REST_API_URL` / `KV_REST_API_TOKEN`）
3. 环境变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | 是 | 批改 LLM |
| `OPENAI_API_KEY` | 是* | 题目图片 OCR（Vision） |
| `LLM_PROVIDER` | 否 | 默认 `deepseek` |
| `LLM_MODEL` | 否 | 默认 `deepseek-v4-flash` |
| `KV_REST_API_URL` | 生产推荐 | Upstash Redis 自动注入 |
| `KV_REST_API_TOKEN` | 生产推荐 | Upstash Redis 自动注入 |

\* 若不上传题目图片可暂不填

### 部署设置

| 项 | 值 |
|----|-----|
| Framework Preset | Other |
| Root Directory | `.`（仓库根） |
| Build Command | `npm run build:vercel` |
| Output Directory | `public` |

`vercel.json` 已配置路由与函数超时。

### 本地 Vercel 开发

```bash
npm install
npm run prepare:portal   # 首次需要
npm run build:vercel
npx vercel dev           # 或 npm run dev:vercel
```

验证：

```bash
# 另开终端，对 vercel dev 默认 http://localhost:3000
npm run verify:vercel
```

### 批改模式

| 模式 | URL / 配置 | 说明 |
|------|------------|------|
| **stepwise**（默认） | — | 5 次 API 调用（4 维度 + 打分），适配 Hobby |
| **monolithic** | `?mode=monolithic` | 单次 `/api/essay-feedback`，需 **Pro** + `maxDuration: 300` |
| **mock** | `?mock=1` | 静态 JSON，无需 LLM |

### Hobby 限制

- 单步函数最长 **10s**；若某次 LLM 调用超时，请升级 **Pro** 或使用 `?mode=monolithic`
- 上传文件上限 **4MB**

---

## Render / Railway（Express 常驻）

适合不想用 Serverless 的场景，支持长时间单次批改。

```bash
cd modules/essay-grading
npm install
npm run build
npm start
```

Root Directory 设为 `modules/essay-grading`，Start Command: `npm start`。

---

## 本地 Express 开发

```bash
npm install
npm run prepare:portal
npm run dev -w @yasu/essay-grading
```

访问 `http://localhost:3101/`（门户 + `/grading` 批改）。

本地无 KV 时使用内存 Session Store，与 `vercel dev` 行为一致。

---

## 构建产物

```text
public/                    Vercel 静态输出（build:vercel 生成）
  index.html               门户
  grading/                 批改 UI
  mock/                    Mock 数据
api/                       Vercel Serverless 入口
modules/essay-grading/dist/  编译后的 API 逻辑
```
