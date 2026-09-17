# 修仙D20｜预设手动粘贴版

如果你不想让扩展自动生成 D20 版预设，可以手动把两份规则加入当前 Chat Completion 预设。

## 文件

- 核心裁判系统：`assets/prompts/d20-core.txt`
- 每轮强制检查：`assets/prompts/d20-guard.txt`

## 推荐位置

### 1. 修仙D20·核心裁判系统

新建一个自定义 Prompt：

- 名称：`修仙D20·核心裁判系统`
- Role：`system`
- 内容：完整复制 `d20-core.txt`
- 推荐顺序：放在 `Main Prompt` 之后，其他剧情/世界设定之前。

### 2. 修仙D20·每轮强制检查

再新建一个自定义 Prompt：

- 名称：`修仙D20·每轮强制检查`
- Role：`system`
- 内容：完整复制 `d20-guard.txt`
- 推荐顺序：放在靠近聊天历史末端的位置，通常在 `Chat History` 之后、`Post-History Instructions / Jailbreak` 之前。

## 注意

1. 两个 Prompt 都必须启用。
2. 不要同时保留旧版 D20 文本、扩展运行时注入和手动新版三套规则，否则会重复。
3. 如果使用 v1.1.0 的“当前预设 + 修仙D20”自动生成模式，则无需手动粘贴。
4. 原小猫预设建议保留一份不修改的备份。
