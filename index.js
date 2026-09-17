const EXTENSION_KEY = 'xiuxianD20Installer';
const VERSION = '1.0.0';
const SET_NAME = '修仙D20';
const MANAGED_REGEX_NAMES = [
    'D20_提取ACTION',
    'D20_提取DC',
    'D20_提取MOD',
    'D20_提取DETAIL',
];

let cachedPayload = null;
let installRunning = false;

function notify(type, message, title = '修仙 D20') {
    const toast = globalThis.toastr?.[type];
    if (typeof toast === 'function') {
        toast(message, title);
    } else {
        console[type === 'error' ? 'error' : 'log'](`[${title}] ${message}`);
    }
}

function getContext() {
    if (!globalThis.SillyTavern?.getContext) {
        throw new Error('SillyTavern.getContext() 不可用。');
    }
    return globalThis.SillyTavern.getContext();
}

async function loadPayload() {
    if (cachedPayload) return cachedPayload;

    const [regexResponse, quickReplyResponse] = await Promise.all([
        fetch(new URL('./assets/regexes.json', import.meta.url), { cache: 'no-store' }),
        fetch(new URL('./assets/quickreply.json', import.meta.url), { cache: 'no-store' }),
    ]);

    if (!regexResponse.ok || !quickReplyResponse.ok) {
        throw new Error('无法读取扩展内置的 D20 配置文件。');
    }

    const regexes = await regexResponse.json();
    const quickReply = await quickReplyResponse.json();

    if (!Array.isArray(regexes) || regexes.length !== 4) {
        throw new Error('Regex 配置数量异常。');
    }
    if (!quickReply || quickReply.version !== 2 || !Array.isArray(quickReply.qrList)) {
        throw new Error('Quick Reply 配置格式异常。');
    }

    cachedPayload = { regexes, quickReply };
    return cachedPayload;
}

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function syncRegexes(regexes, forceUpdate) {
    const { extensionSettings, saveSettingsDebounced } = getContext();
    if (!Array.isArray(extensionSettings.regex)) {
        extensionSettings.regex = [];
    }

    const target = extensionSettings.regex;
    let added = 0;
    let updated = 0;
    let removedDuplicates = 0;

    for (const source of regexes) {
        const matches = target
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item?.scriptName === source.scriptName);

        if (matches.length === 0) {
            target.push(clone(source));
            added += 1;
            continue;
        }

        const keep = matches[0];
        if (forceUpdate) {
            const preservedId = keep.item.id || source.id;
            Object.assign(keep.item, clone(source), { id: preservedId });
            updated += 1;
        }

        for (let i = matches.length - 1; i >= 1; i--) {
            target.splice(matches[i].index, 1);
            removedDuplicates += 1;
        }
    }

    saveSettingsDebounced();
    return { added, updated, removedDuplicates };
}

async function waitForQuickReplyApi(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (globalThis.quickReplyApi) return globalThis.quickReplyApi;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
}

function copyManagedQrFields(target, source) {
    const id = target.id;
    const fields = [
        'icon', 'showLabel', 'label', 'title', 'message', 'contextList',
        'preventAutoExecute', 'isHidden', 'executeOnStartup', 'executeOnUser',
        'executeOnAi', 'executeOnChatChange', 'executeOnGroupMemberDraft',
        'executeOnNewChat', 'executeBeforeGeneration', 'automationId',
    ];
    for (const field of fields) {
        if (Object.hasOwn(source, field)) {
            target[field] = clone(source[field]);
        }
    }
    target.id = id;
}

async function syncQuickReplies(payload, forceUpdate, enableSystem = false) {
    const api = await waitForQuickReplyApi();
    if (!api) {
        throw new Error('Quick Replies API 未加载。请确认内置 Quick Replies 扩展没有被禁用。');
    }

    let set = api.getSetByName(SET_NAME);
    const created = !set;
    if (!set) {
        set = await api.createSet(SET_NAME, {
            disableSend: payload.disableSend,
            placeBeforeInput: payload.placeBeforeInput,
            injectInput: payload.injectInput,
        });
    }

    if (created || forceUpdate) {
        set.disableSend = payload.disableSend ?? false;
        set.placeBeforeInput = payload.placeBeforeInput ?? false;
        set.injectInput = payload.injectInput ?? false;
        set.color = payload.color ?? 'transparent';
        set.onlyBorderColor = payload.onlyBorderColor ?? false;
    }

    let added = 0;
    let updated = 0;
    let removedDuplicates = 0;

    for (const source of payload.qrList) {
        const matches = set.qrList.filter(qr => qr.label === source.label);
        let qr = matches[0];

        if (!qr) {
            const data = clone(source);
            delete data.id;
            qr = set.addQuickReply(data);
            added += 1;
        } else if (forceUpdate) {
            copyManagedQrFields(qr, source);
            updated += 1;
        }

        for (let i = matches.length - 1; i >= 1; i--) {
            const duplicate = matches[i];
            const index = set.qrList.indexOf(duplicate);
            if (index !== -1) {
                set.qrList.splice(index, 1);
                removedDuplicates += 1;
            }
        }
    }

    await set.save();

    const globalSets = api.listGlobalSets?.() ?? [];
    if (!globalSets.includes(SET_NAME)) {
        api.addGlobalSet(SET_NAME, true);
    }

    let quickRepliesEnabled = Boolean(api.settings?.isEnabled);
    if (enableSystem && api.settings && !api.settings.isEnabled) {
        api.settings.isEnabled = true;
        api.settings.save();
        quickRepliesEnabled = true;
        const enabledCheckbox = document.querySelector('#qr--isEnabled');
        if (enabledCheckbox instanceof HTMLInputElement) enabledCheckbox.checked = true;
    }

    return {
        created,
        added,
        updated,
        removedDuplicates,
        quickRepliesEnabled,
    };
}

function getDependencyWarnings() {
    const { extensionSettings } = getContext();
    const disabled = extensionSettings.disabledExtensions ?? [];
    const warnings = [];
    if (disabled.includes('regex')) warnings.push('内置 Regex 扩展已被禁用');
    if (disabled.includes('quick-reply')) warnings.push('内置 Quick Replies 扩展已被禁用');
    return warnings;
}

async function inspectStatus() {
    const { extensionSettings } = getContext();
    const regexList = Array.isArray(extensionSettings.regex) ? extensionSettings.regex : [];
    const regexFound = MANAGED_REGEX_NAMES.filter(name => regexList.some(rule => rule?.scriptName === name)).length;

    const api = globalThis.quickReplyApi;
    let qrFound = 0;
    let qrTotal = 7;
    let isGlobal = false;
    let quickRepliesEnabled = null;

    if (api) {
        const set = api.getSetByName(SET_NAME);
        if (set) {
            const payload = await loadPayload();
            qrTotal = payload.quickReply.qrList.length;
            qrFound = payload.quickReply.qrList.filter(source => set.qrList.some(qr => qr.label === source.label)).length;
        }
        isGlobal = (api.listGlobalSets?.() ?? []).includes(SET_NAME);
        quickRepliesEnabled = typeof api.settings?.isEnabled === 'boolean' ? api.settings.isEnabled : null;
    }

    const warnings = getDependencyWarnings();
    return {
        regexFound,
        regexTotal: MANAGED_REGEX_NAMES.length,
        qrFound,
        qrTotal,
        isGlobal,
        quickRepliesEnabled,
        warnings,
        version: extensionSettings[EXTENSION_KEY]?.installedVersion ?? '未记录',
    };
}

function formatStatus(status) {
    const qrEnabled = status.quickRepliesEnabled === null ? '未知' : (status.quickRepliesEnabled ? '已开启' : '未开启');
    const warning = status.warnings.length ? `；警告：${status.warnings.join('、')}` : '';
    return `版本 ${status.version}｜Regex ${status.regexFound}/${status.regexTotal}｜QR ${status.qrFound}/${status.qrTotal}｜全局挂载 ${status.isGlobal ? '是' : '否'}｜Quick Replies ${qrEnabled}${warning}`;
}

async function refreshPanelStatus() {
    const node = document.querySelector('#xiuxian-d20-installer-status');
    if (!node) return;
    try {
        node.textContent = formatStatus(await inspectStatus());
    } catch (error) {
        node.textContent = `状态检查失败：${error.message}`;
    }
}

async function runInstall({ force = false, silent = false } = {}) {
    if (installRunning) return;
    installRunning = true;

    try {
        const payload = await loadPayload();
        const { extensionSettings, saveSettingsDebounced } = getContext();
        extensionSettings[EXTENSION_KEY] ??= {};
        const state = extensionSettings[EXTENSION_KEY];
        const versionChanged = state.installedVersion !== VERSION;
        const shouldForce = force || versionChanged;

        const regexResult = syncRegexes(payload.regexes, shouldForce);
        const qrResult = await syncQuickReplies(payload.quickReply, shouldForce, shouldForce);

        state.installedVersion = VERSION;
        state.lastSync = new Date().toISOString();
        state.qrSetName = SET_NAME;
        state.managedRegexNames = [...MANAGED_REGEX_NAMES];
        delete state.lastError;
        saveSettingsDebounced();

        const warnings = getDependencyWarnings();
        if (!silent) {
            const details = [
                `Regex：新增 ${regexResult.added}，更新 ${regexResult.updated}`,
                `QR：新增 ${qrResult.added}，更新 ${qrResult.updated}`,
            ];
            if (warnings.length) details.push(`注意：${warnings.join('、')}`);
            notify(warnings.length ? 'warning' : 'success', details.join('；'));
        }
    } catch (error) {
        console.error('[修仙D20 Installer] 安装失败', error);
        try {
            const { extensionSettings, saveSettingsDebounced } = getContext();
            extensionSettings[EXTENSION_KEY] ??= {};
            extensionSettings[EXTENSION_KEY].lastError = String(error?.message ?? error);
            saveSettingsDebounced();
        } catch {}
        if (!silent) notify('error', error.message || String(error));
    } finally {
        installRunning = false;
        await refreshPanelStatus();
    }
}

function createSettingsPanel() {
    if (document.querySelector('#xiuxian-d20-installer-panel')) return;
    const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!host) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'xiuxian-d20-installer-panel';
    wrapper.className = 'xiuxian-d20-installer-settings';
    wrapper.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎲 修仙 D20 一键安装器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p id="xiuxian-d20-installer-status">正在检查……</p>
                <div class="flex-container flexWrap">
                    <button id="xiuxian-d20-installer-repair" class="menu_button">重新安装 / 修复 D20 配置</button>
                    <button id="xiuxian-d20-installer-check" class="menu_button">检查状态</button>
                </div>
                <small>只管理 D20_提取ACTION / DC / MOD / DETAIL 与“修仙D20”中的 7 个内置快捷回复；不会删除其他自定义配置。</small>
            </div>
        </div>`;
    host.append(wrapper);

    wrapper.querySelector('#xiuxian-d20-installer-repair')?.addEventListener('click', () => runInstall({ force: true }));
    wrapper.querySelector('#xiuxian-d20-installer-check')?.addEventListener('click', async () => {
        await refreshPanelStatus();
        notify('info', 'D20 配置状态已刷新。');
    });

    refreshPanelStatus();
}

export async function init() {
    try {
        getContext();
        createSettingsPanel();

        const { extensionSettings } = getContext();
        const state = extensionSettings[EXTENSION_KEY] ?? {};
        const payload = await loadPayload();
        const regexList = Array.isArray(extensionSettings.regex) ? extensionSettings.regex : [];
        const missingRegex = payload.regexes.some(rule => !regexList.some(existing => existing?.scriptName === rule.scriptName));

        const api = await waitForQuickReplyApi();
        const set = api?.getSetByName(SET_NAME);
        const missingQr = !set || payload.quickReply.qrList.some(source => !set.qrList.some(qr => qr.label === source.label));
        const needsInstall = state.installedVersion !== VERSION || missingRegex || missingQr;

        if (needsInstall) {
            await runInstall({ force: state.installedVersion !== VERSION, silent: false });
        } else {
            // 已完整安装时尊重用户后续的启用/禁用和内容修改，只刷新状态，不主动改写配置。
            await refreshPanelStatus();
        }
    } catch (error) {
        console.error('[修仙D20 Installer] 初始化失败', error);
        notify('error', error.message || String(error));
    }
}
