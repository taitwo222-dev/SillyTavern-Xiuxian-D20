# 修仙 D20 一键安装器（SillyTavern）

把一套“修仙 D20”判定系统需要的 **4 条 Regex + 1 套 Quick Replies（7 个快捷回复）** 一次性装入 SillyTavern。

## 它会安装什么

### Regex

- `D20_提取ACTION`
- `D20_提取DC`
- `D20_提取MOD`
- `D20_提取DETAIL`

### Quick Reply Set

名称：`修仙D20`

内含：

- `🎲D20初始化`
- `⚙️D20自动处理器`（隐藏，AI 回复后自动触发）
- `📜 D20状态`
- `✅ 接受结果`
- `☯ 天道重Roll`
- `☯ 天道+1`
- `测试DETAIL`

## 用户安装方法（一键安装）

1. 在 SillyTavern 打开 **扩展（Extensions）**。
2. 选择 **Install Extension / 安装扩展**。
3. 粘贴仓库地址：`https://github.com/taitwo222-dev/SillyTavern-Xiuxian-D20`。
4. 完成安装后启用本扩展；首次加载会自动安装 D20 所需配置。
5. 建议先点击一次 `🎲D20初始化`。

正常完成后，在扩展设置中会出现 **“🎲 修仙 D20 一键安装器”** 面板，可查看：

- Regex 是否为 `4/4`
- Quick Replies 是否为 `7/7`
- `修仙D20` 是否已挂载为全局 Quick Reply Set
- Quick Replies 总开关是否开启

如配置被误删或改坏，可点 **“重新安装 / 修复 D20 配置”** 恢复本版本默认值。

## 依赖

依赖 SillyTavern 自带的：

- Regex
- Quick Replies

如果你手动禁用了其中任何一个，请先重新启用后刷新 SillyTavern。

## 判定请求格式

自动处理器会在 AI 回复中寻找 `[D20_REQUEST]`，并从同一条回复提取：

```text
[D20_REQUEST]
ACTION=本次行动说明
DC=12
MOD=+3
DETAIL=境界、装备、环境等修正来源
```

其中：

- `ACTION`：行动说明
- `DC`：难度值，整数
- `MOD`：综合修正，可正可负
- `DETAIL`：修正因素说明

之后由酒馆本地 Quick Reply 脚本执行 `1d20`，计算最终值与结果等级。

## 安装器的更新/覆盖规则

为了尽量不干扰用户其他配置：

- 只识别并管理上述 **4 个固定 Regex 名称**。
- 只识别并管理 `修仙D20` 中上述 **7 个固定 QR 标签**。
- 不删除用户其他 Regex。
- 不删除 `修仙D20` 中用户后来自己添加的其他 QR。
- 首次安装会将 `修仙D20` 挂到全局 Quick Replies，并开启 Quick Replies 总开关。
- 安装完整后，普通重启只做状态检查，**不会强制重新开启用户后来主动关闭的 Quick Replies，也不会覆盖用户修改**。
- 当扩展版本号升级，或用户主动点击“重新安装 / 修复”时，会用新版本内置配置更新这 4 个 Regex 和 7 个托管 QR。

## 与原始配置相比的两个整理项

1. `D20_提取ACTION` 原文件已经写了捕获组，但 `replaceString` 为空；本包改为 `$1`，使 ACTION 真正返回捕获内容。
2. Quick Reply Set 原名称末尾有一个空格（`修仙D20 `）；本包统一为 `修仙D20`，避免名称匹配时出现肉眼难以发现的问题。

除此之外，D20 的判定、天道重 Roll、接受结果等 Slash Command 逻辑保持原配置。

## 手动兼容安装

如果某些环境无法使用 Git 扩展安装，可进入 `manual/`：

1. 向 Regex 扩展导入 `修仙D20_Regex合集.json`（一次导入 4 条）。
2. 向 Quick Replies 导入 `修仙D20_QuickReplies.json`。
3. 把 `修仙D20` 加到全局 Quick Reply Set，并确认 Quick Replies 已开启。

这条路线需要两次导入；真正的一键安装请使用扩展安装方式。

## 仓库地址

`https://github.com/taitwo222-dev/SillyTavern-Xiuxian-D20`

## 安全说明

这是第三方 SillyTavern UI 扩展，会在酒馆前端运行 JavaScript。公开发布时建议保留源码，让用户能直接审查 `index.js` 和两个 `assets/*.json`。

## License

MIT
