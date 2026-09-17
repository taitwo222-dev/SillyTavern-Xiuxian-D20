# 🎲 修仙 D20 判定系统｜SillyTavern 一键安装版

把之前需要分别导入的 **4 个 Regex + 修仙D20 Quick Replies** 做成了一个 SillyTavern 第三方扩展。

安装后会自动配置：

- D20_提取ACTION
- D20_提取DC
- D20_提取MOD
- D20_提取DETAIL
- 修仙D20 Quick Reply Set（初始化、自动判定、接受结果、天道重Roll、状态等）
- 两套 D20 裁判规则
- 天道点自动奖励：突破 +1、完成新秘境 +1、首次征服新的女修 +1

## 一键安装

在 SillyTavern：

**扩展 → Install Extension → 粘贴仓库地址**

仓库地址：

```text
https://github.com/taitwo222-dev/SillyTavern-Xiuxian-D20.git
```

首次加载会自动安装并挂载配置。安装完成后建议先点一次：

**🎲D20初始化**

## 天道点

天道点上限 5，可用于天道重Roll。

自动获取规则：

- 正式完成一次新的境界/小境界突破：+1
- 完成一个新的秘境：+1
- 首次征服一名新的女修：+1，同一名女修只奖励一次

扩展会自动去重。D20 仍处于待结算时不会提前奖励。

## 使用前提

请不要禁用 SillyTavern 自带的 **Regex** 和 **Quick Replies** 扩展。

如果出现配置缺失，可以在扩展设置找到：

**🎲 修仙 D20 一键安装器 → 重新安装 / 修复 D20 配置**

## AI 输出的判定请求格式

```text
[D20_REQUEST]
ACTION=行动说明
DC=12
MOD=+3
DETAIL=修正因素说明
```

骰点由酒馆本地脚本执行，不需要模型自己“编骰子”。

## 手动兼容版

仓库 `manual/` 目录也附带：

- 4 Regex 合集 JSON
- Quick Replies JSON

无法安装第三方扩展时，可以使用这两个文件手动导入。

## 说明

安装器只管理本系统固定的 4 条 Regex、7 个内置 QR 与两套 D20 规则，不会清空其他用户配置，也不会修改用户的第三方预设。源码全部公开，可以自行检查和修改。
