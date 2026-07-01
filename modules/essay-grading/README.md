# @yasu/essay-grading

雅速雅思作文批改模块：IELTS 四维 Band 评分 + 原文批注高亮，支持 Task 1（Academic/GT）与 Task 2。

## 目录结构

```
src/
├── core/       # 类型、常量、作文解析、批注归一化
├── grading/    # LangGraph 流水线、Prompt、OpenAI 调用
├── api/        # Express 服务与文件抽取
└── web/        # 四屏 UI（默认中文，可切换英文）
```

## 开发

```bash
cp .env.example .env
npm install
npm run dev
```

## 生产

```bash
npm run build
npm start
```

## API

### `POST /api/extract-text`

multipart 字段 `file`，返回 `{ essay_text, filename }`。

### `POST /api/essay-feedback`

```json
{
  "essay_text": "...",
  "task_type": "Task 2",
  "question": "...",
  "locale": "zh"
}
```

## 程序化接入（供主站使用）

```typescript
import { runFeedbackGraph } from "@yasu/essay-grading";

const result = await runFeedbackGraph(essayText, {
  taskType: "Task 2",
  question: "...",
  locale: "zh",
});
```

## Integration（主站接入方式）

| 方式 | 说明 |
|------|------|
| **Vercel 全栈** | `npm run build:vercel`，门户 `/` + 批改 `/grading` + 分步 API |
| 同服 Express（本地） | 门户在 `/`，批改 UI 在 `/grading`，API 在 `/api/*` |
| 独立部署 | `npm run build && npm start`，仅批改模块 |
| 嵌入 API | 分步 `/api/grade/*` 或单体 `/api/essay-feedback` |
| 嵌入 UI | 挂载 `dist/public/` 到主站 `/grading` 路由 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 必填 |
| `OPENAI_MODEL` | 默认 `gpt-4o-mini` |
| `PORT` | 默认 `3101` |
