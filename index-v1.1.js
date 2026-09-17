import { init as baseInit } from './index.js';

const EXTENSION_KEY = 'xiuxianD20Installer';
const BASE_VERSION = '1.0.3';
const WRAPPER_VERSION = '1.1.1';

function getContext() {
    if (!globalThis.SillyTavern?.getContext) throw new Error('SillyTavern.getContext() 不可用。');
    return globalThis.SillyTavern.getContext();
}

export async function init() {
    const context = getContext();
    context.extensionSettings[EXTENSION_KEY] ??= {};

    // 兼容 1.0.3 核心安装器：先临时对齐其内部版本，避免每次刷新都强制重装。
    context.extensionSettings[EXTENSION_KEY].installedVersion = BASE_VERSION;
    context.saveSettingsDebounced?.();

    await baseInit();

    // v1.1.1 起不再复制、重命名或生成任何第三方预设。
    // 固定只使用扩展内置的两套 D20 规则：
    // 1. 修仙D20·核心裁判系统
    // 2. 修仙D20·每轮强制检查
    // 两套规则由核心安装器通过 Extension Prompt 自动注入，不夹带任何其他预设内容。
    const state = context.extensionSettings[EXTENSION_KEY];
    state.installedVersion = WRAPPER_VERSION;
    state.promptMode = 'd20-only-runtime-injection';

    // 清除旧版“复制当前预设 + 修仙D20”模式留下的扩展状态记录。
    delete state.presetMode;
    delete state.presetName;
    delete state.presetSourceName;
    delete state.presetAutoHandledV110;
    delete state.presetAutoError;

    context.saveSettingsDebounced?.();
}
