# Debug Session: openai-connect-failure
- **Status**: [OPEN]
- **Issue**: 用户已完成 VITE_OPENAI_API_KEY 配置，但 AI 设置页测试连接仍提示“校验未通过：无法连接 openai，请检查网络或 Base URL”。用户表示配置信息本身正确。
- **Debug Server**: pending
- **Log File**: pending

## Reproduction Steps
1. 在 AI 设置页配置 OpenAI provider 与模型。
2. 在页面或环境变量中配置 `VITE_OPENAI_API_KEY`。
3. 点击“测试模型连接”。
4. 观察到测试结果为错误，提示无法连接 OpenAI。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 测试函数读取到的 API Key 实际为空或未生效 | High | Low | 记录 resolveEffectiveApiKey 结果 |
| B | Tauri/Vite 环境未加载最新环境变量，或运行时未刷新 | Medium | Low | 记录 import.meta.env 中 VITE_OPENAI_API_KEY 是否为空 |
| C | fetch 请求被 CSP/网络/域策略拦截 | Medium | Medium | 记录 fetch 发起前 URL 与 catch 错误详情 |
| D | OpenAI 返回 401/403 但被统一误报为“无法连接” | Medium | Low | 记录响应状态码与响应体 |

## Log Evidence
[PENDING]

## Verification Conclusion
[PENDING]
