import { init as baseInit } from './index.js';

const EXTENSION_KEY = 'xiuxianD20Installer';
const BASE_VERSION = '1.0.3';
const WRAPPER_VERSION = '1.1.3';
const OUTPUT_GUARD_SENTINEL = '__xiuxianD20PendingOutputGuardV113';

function getContext() {
    if (!globalThis.SillyTavern?.getContext) throw new Error('SillyTavern.getContext() 不可用。');
    return globalThis.SillyTavern.getContext();
}

/**
 * D20 请求出现时，本轮输出必须停在判定点。
 * 这里只清理“预设额外生成的交互 UI”，绝不读取、修改或保存用户预设本体。
 */
function stripPendingInteractionBlocks(text) {
    if (typeof text !== 'string' || !text.includes('[D20_REQUEST]')) return text;

    let cleaned = text;

    // 常见的三选一/行动选项块。
    cleaned = cleaned.replace(/<options\b[^>]*>[\s\S]*?<\/options\s*>/gi, '');

    // 小猫之神 Reborn 等预设使用的留言折叠块。
    cleaned = cleaned.replace(
        /<details\b[^>]*>\s*<summary\b[^>]*>\s*小猫之神的留言\s*<\/summary\s*>[\s\S]*?<\/details\s*>/gi,
        '',
    );

    // 容错：summary 中存在额外空格、图标或少量包装文本时仍能识别。
    cleaned = cleaned.replace(
        /<details\b[^>]*>[\s\S]*?<summary\b[^>]*>[\s\S]*?小猫之神的留言[\s\S]*?<\/summary\s*>[\s\S]*?<\/details\s*>/gi,
        '',
    );

    // 容错：模型偶尔漏掉闭合标签时，从对应交互块起截掉尾部。
    cleaned = cleaned.replace(/<options\b[^>]*>[\s\S]*$/gi, '');
    cleaned = cleaned.replace(
        /<details\b[^>]*>[\s\S]*?<summary\b[^>]*>[\s\S]*?小猫之神的留言[\s\S]*$/gi,
        '',
    );

    return cleaned.replace(/\n{3,}/g, '\n\n').trimEnd();
}

async function sanitizeMessageById(messageId, { rerender = false } = {}) {
    const context = getContext();
    const index = Number(messageId);
    if (!Number.isInteger(index) || index < 0) return false;

    const message = context.chat?.[index];
    if (!message || message.is_user || typeof message.mes !== 'string') return false;

    const original = message.mes;
    const cleaned = stripPendingInteractionBlocks(original);
    if (cleaned === original) return false;

    message.mes = cleaned;
    message.extra ??= {};
    message.extra.xiuxianD20PendingOutputGuard = true;

    if (rerender && typeof context.updateMessageBlock === 'function') {
        context.updateMessageBlock(index, message);
    }

    try {
        await context.saveChat?.();
    } catch (error) {
        console.warn('[修仙D20] 保存交互冻结后的消息失败', error);
    }

    return true;
}

async function sanitizeLatestAssistantMessage({ rerender = true } = {}) {
    const context = getContext();
    const chat = context.chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i]?.is_user) {
            return sanitizeMessageById(i, { rerender });
        }
    }
    return false;
}

function installPendingOutputGuard() {
    // 防止扩展热重载时重复挂载监听器。
    if (globalThis[OUTPUT_GUARD_SENTINEL]) return;

    const context = getContext();
    const eventSource = context.eventSource;
    const events = context.eventTypes ?? context.event_types;
    if (!eventSource || !events) {
        console.warn('[修仙D20] 无法挂载 D20 等待交互硬拦截：事件 API 不可用。');
        return;
    }

    // 非流式/消息正式入列时，尽可能在初次渲染前清理。
    if (events.MESSAGE_RECEIVED) {
        eventSource.on(events.MESSAGE_RECEIVED, async (messageId) => {
            await sanitizeMessageById(messageId, { rerender: false });
        });
    }

    // 流式生成时 MESSAGE_RECEIVED 可能晚于首次显示，因此生成结束后再做一次硬校验并重绘。
    const sanitizeAfterGeneration = async () => {
        await sanitizeLatestAssistantMessage({ rerender: true });
    };
    if (events.GENERATION_ENDED) eventSource.on(events.GENERATION_ENDED, sanitizeAfterGeneration);
    if (events.GENERATION_STOPPED) eventSource.on(events.GENERATION_STOPPED, sanitizeAfterGeneration);

    globalThis[OUTPUT_GUARD_SENTINEL] = true;
}

export async function init() {
    const context = getContext();
    context.extensionSettings[EXTENSION_KEY] ??= {};

    // 兼容 1.0.3 核心安装器：先临时对齐其内部版本，避免每次刷新都强制重装。
    context.extensionSettings[EXTENSION_KEY].installedVersion = BASE_VERSION;
    context.saveSettingsDebounced?.();

    await baseInit();

    // v1.1.1 起不再复制、重命名、生成或修改任何第三方预设。
    // 固定只使用扩展内置的两套 D20 规则，并通过 Extension Prompt 运行时注入。
    const state = context.extensionSettings[EXTENSION_KEY];
    state.installedVersion = WRAPPER_VERSION;
    state.promptMode = 'd20-only-runtime-injection';
    state.presetMutation = false;
    state.pendingOutputGuard = true;

    // 清除旧版“复制当前预设 + 修仙D20”模式留下的扩展状态记录。
    delete state.presetMode;
    delete state.presetName;
    delete state.presetSourceName;
    delete state.presetAutoHandledV110;
    delete state.presetAutoError;

    installPendingOutputGuard();

    // 更新/刷新扩展后，顺手清理当前最后一条尚未处理的 D20 请求消息。
    await sanitizeLatestAssistantMessage({ rerender: true });

    context.saveSettingsDebounced?.();
}
