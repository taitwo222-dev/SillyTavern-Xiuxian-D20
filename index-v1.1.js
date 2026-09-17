import { init as baseInit } from './index.js';

const EXTENSION_KEY = 'xiuxianD20Installer';
const BASE_VERSION = '1.0.3';
const WRAPPER_VERSION = '1.1.0';
const PRESET_SUFFIX = ' + 修仙D20';
const CORE_ID = 'xiuxian_d20_core';
const GUARD_ID = 'xiuxian_d20_guard';
const CORE_RUNTIME_KEY = 'xiuxian_d20_core_rules';
const GUARD_RUNTIME_KEY = 'xiuxian_d20_guard_rules';

function notify(type, message, title = '修仙 D20') {
    const fn = globalThis.toastr?.[type];
    if (typeof fn === 'function') fn(message, title);
    else console[type === 'error' ? 'error' : 'log'](`[${title}] ${message}`);
}

function getContext() {
    if (!globalThis.SillyTavern?.getContext) throw new Error('SillyTavern.getContext() 不可用。');
    return globalThis.SillyTavern.getContext();
}

function clone(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

async function loadPromptTexts() {
    const [coreRes, guardRes] = await Promise.all([
        fetch(new URL('./assets/prompts/d20-core.txt', import.meta.url), { cache: 'no-store' }),
        fetch(new URL('./assets/prompts/d20-guard.txt', import.meta.url), { cache: 'no-store' }),
    ]);
    if (!coreRes.ok || !guardRes.ok) throw new Error('无法读取 D20 预设提示词文件。');
    return { core: await coreRes.text(), guard: await guardRes.text() };
}

async function waitForPresetManager(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const context = getContext();
        const manager = context.getPresetManager?.('openai') ?? context.getPresetManager?.();
        if (manager?.getSelectedPresetName && manager?.getPresetSettings && manager?.savePreset) return manager;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    return null;
}

function upsertPrompt(prompts, identifier, name, content) {
    const item = { identifier, name, system_prompt: false, marker: false, role: 'system', content };
    const index = prompts.findIndex(x => x?.identifier === identifier);
    if (index >= 0) prompts[index] = { ...prompts[index], ...item };
    else prompts.push(item);
}

function placeManagedPrompts(order) {
    if (!Array.isArray(order)) return;
    const cleaned = order.filter(x => ![CORE_ID, GUARD_ID].includes(x?.identifier));
    const coreEntry = { identifier: CORE_ID, enabled: true };
    const guardEntry = { identifier: GUARD_ID, enabled: true };

    let mainIndex = cleaned.findIndex(x => x?.identifier === 'main');
    if (mainIndex < 0) mainIndex = -1;
    cleaned.splice(mainIndex + 1, 0, coreEntry);

    let guardIndex = cleaned.findIndex(x => x?.identifier === 'jailbreak');
    if (guardIndex < 0) guardIndex = cleaned.length;
    cleaned.splice(guardIndex, 0, guardEntry);
    order.splice(0, order.length, ...cleaned);
}

async function clearRuntimePromptInjection() {
    const context = getContext();
    if (typeof context.setExtensionPrompt !== 'function') return;
    try {
        const { extension_prompt_types, extension_prompt_roles } = await import('/script.js');
        context.setExtensionPrompt(CORE_RUNTIME_KEY, '', extension_prompt_types.NONE, 0, false, extension_prompt_roles.SYSTEM);
        context.setExtensionPrompt(GUARD_RUNTIME_KEY, '', extension_prompt_types.NONE, 0, false, extension_prompt_roles.SYSTEM);
    } catch (error) {
        console.warn('[修仙D20] 清除运行时规则注入失败', error);
    }
}

async function buildPresetCopy({ silent = false } = {}) {
    const context = getContext();
    const manager = await waitForPresetManager();
    if (!manager) throw new Error('当前没有可用的 Chat Completion 预设管理器。请先选择小猫预设后再试。');

    const selectedName = manager.getSelectedPresetName?.();
    if (!selectedName) throw new Error('无法读取当前预设名称。');

    const sourceName = selectedName.endsWith(PRESET_SUFFIX)
        ? selectedName.slice(0, -PRESET_SUFFIX.length)
        : selectedName;
    const targetName = `${sourceName}${PRESET_SUFFIX}`;

    const existingValue = manager.findPreset?.(targetName);
    let data;
    if (existingValue !== undefined && existingValue !== null) data = clone(manager.getPresetSettings(targetName));
    else data = clone(manager.getPresetSettings(selectedName));

    if (!data || typeof data !== 'object') throw new Error('无法读取当前预设内容。');
    if (!Array.isArray(data.prompts)) data.prompts = [];
    if (!Array.isArray(data.prompt_order)) data.prompt_order = [];

    const { core, guard } = await loadPromptTexts();
    upsertPrompt(data.prompts, CORE_ID, '修仙D20·核心裁判系统', core);
    upsertPrompt(data.prompts, GUARD_ID, '修仙D20·每轮强制检查', guard);

    if (data.prompt_order.length === 0) data.prompt_order.push({ character_id: 100000, order: [] });
    for (const group of data.prompt_order) {
        if (!Array.isArray(group.order)) group.order = [];
        placeManagedPrompts(group.order);
    }

    await manager.savePreset(targetName, data);
    const targetValue = manager.findPreset?.(targetName);
    if (targetValue !== undefined && targetValue !== null && manager.selectPreset) await manager.selectPreset(targetValue);

    const { extensionSettings, saveSettingsDebounced } = context;
    extensionSettings[EXTENSION_KEY] ??= {};
    extensionSettings[EXTENSION_KEY].presetMode = true;
    extensionSettings[EXTENSION_KEY].presetName = targetName;
    extensionSettings[EXTENSION_KEY].presetSourceName = sourceName;
    extensionSettings[EXTENSION_KEY].installedVersion = WRAPPER_VERSION;
    saveSettingsDebounced?.();

    await clearRuntimePromptInjection();
    if (!silent) notify('success', `已生成并切换到：${targetName}。原预设未修改。`);
    return targetName;
}

function addPresetModePanel() {
    if (document.querySelector('#xiuxian-d20-preset-mode')) return;
    const host = document.querySelector('#xiuxian-d20-installer-panel .inline-drawer-content');
    if (!host) return;

    const box = document.createElement('div');
    box.id = 'xiuxian-d20-preset-mode';
    box.innerHTML = `
        <hr>
        <div><b>预设写入模式</b></div>
        <small>复制当前 Chat Completion 预设，生成“原预设名 + 修仙D20”。原预设不会被修改。</small>
        <div class="flex-container flexWrap" style="margin-top:8px">
            <button id="xiuxian-d20-build-preset" class="menu_button">生成 / 更新 当前预设 + 修仙D20</button>
        </div>
        <small id="xiuxian-d20-preset-status"></small>
    `;
    host.append(box);

    box.querySelector('#xiuxian-d20-build-preset')?.addEventListener('click', async () => {
        const status = box.querySelector('#xiuxian-d20-preset-status');
        try {
            if (status) status.textContent = '正在生成……';
            const name = await buildPresetCopy({ silent: false });
            if (status) status.textContent = `当前 D20 预设：${name}`;
        } catch (error) {
            if (status) status.textContent = `生成失败：${error.message}`;
            notify('error', error.message || String(error));
        }
    });

    try {
        const state = getContext().extensionSettings?.[EXTENSION_KEY];
        const status = box.querySelector('#xiuxian-d20-preset-status');
        if (status && state?.presetName) status.textContent = `当前 D20 预设：${state.presetName}`;
    } catch {}
}

function protectPresetModeButtons() {
    for (const id of ['#xiuxian-d20-installer-repair', '#xiuxian-d20-installer-check']) {
        const button = document.querySelector(id);
        button?.addEventListener('click', () => {
            setTimeout(async () => {
                const state = getContext().extensionSettings?.[EXTENSION_KEY];
                if (state?.presetMode) await clearRuntimePromptInjection();
            }, 300);
        });
    }
}

async function maybeAutoBuildPreset() {
    const context = getContext();
    const { extensionSettings, saveSettingsDebounced } = context;
    extensionSettings[EXTENSION_KEY] ??= {};
    const state = extensionSettings[EXTENSION_KEY];

    if (state.presetAutoHandledV110) {
        if (state.presetMode) await clearRuntimePromptInjection();
        state.installedVersion = WRAPPER_VERSION;
        saveSettingsDebounced?.();
        return;
    }

    try {
        const name = await buildPresetCopy({ silent: true });
        state.presetAutoHandledV110 = true;
        state.presetMode = true;
        state.presetName = name;
        state.installedVersion = WRAPPER_VERSION;
        saveSettingsDebounced?.();
        notify('success', `v1.1.0 已自动创建并切换到：${name}。原预设保持不变。`);
    } catch (error) {
        state.presetAutoHandledV110 = true;
        state.presetMode = false;
        state.presetAutoError = String(error?.message ?? error);
        state.installedVersion = WRAPPER_VERSION;
        saveSettingsDebounced?.();
        console.warn('[修仙D20] 自动生成 D20 预设失败，将继续使用运行时规则注入。', error);
        notify('warning', `未能自动生成 D20 预设：${error.message}。当前仍使用运行时规则注入，可稍后在扩展面板手动生成。`);
    }
}

export async function init() {
    const context = getContext();
    context.extensionSettings[EXTENSION_KEY] ??= {};
    // 兼容旧核心安装器：在调用 1.0.3 核心前临时对齐其内部版本，避免每次刷新都强制重装。
    context.extensionSettings[EXTENSION_KEY].installedVersion = BASE_VERSION;
    context.saveSettingsDebounced?.();

    await baseInit();
    addPresetModePanel();
    protectPresetModeButtons();
    await maybeAutoBuildPreset();

    context.extensionSettings[EXTENSION_KEY].installedVersion = WRAPPER_VERSION;
    context.saveSettingsDebounced?.();
}
