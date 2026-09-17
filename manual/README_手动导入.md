# 手动兼容安装

仅在无法通过 Git 仓库安装“修仙 D20 一键安装器”时使用。

1.1.5 的独立手动包继续使用酒馆自带 STscript 与 Regex，不依赖扩展注册的命令。Regex 已限定 `D20_REQUEST` 边界，但独立手动模式没有扩展的逐项求和、全零说明检查、原始消息诊断和升级迁移保护。需要完整修复时使用扩展模式；`assets/quickreply.json` 属于扩展专用资源，不应单独导入到没有本扩展的酒馆中。

## 第一步：Regex

在 SillyTavern 的 Regex 管理界面导入：

`修仙D20_Regex合集.json`

该文件包含 4 条规则：

- D20_提取ACTION
- D20_提取DC
- D20_提取MOD
- D20_提取DETAIL

## 第二步：Quick Replies

在 Quick Replies 中导入：

`修仙D20_QuickReplies.json`

然后把 `修仙D20` 加到全局 Quick Reply Set，并确认 Quick Replies 总开关已经打开。

最后执行一次 `🎲D20初始化`。

以上初始化只用于新安装且愿意清空天道点/判定缓存的聊天；已有聊天更新无需初始化。避免同时启用 `修仙D20` 与旧名 `修仙D20 ` 的自动处理器。

> 手动方式是“两次导入”；如果希望论坛用户真正一次安装完成，请使用仓库根目录里的第三方扩展方式。
