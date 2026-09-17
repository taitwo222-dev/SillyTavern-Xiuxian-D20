# 手动兼容安装

仅在无法通过 Git 仓库安装“修仙 D20 一键安装器”时使用。

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

> 手动方式是“两次导入”；如果希望论坛用户真正一次安装完成，请使用仓库根目录里的第三方扩展方式。
