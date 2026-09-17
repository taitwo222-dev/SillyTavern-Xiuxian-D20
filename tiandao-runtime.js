const MAX_TIANDAO = 5;
const AWARD_TYPES = new Set(['BREAKTHROUGH', 'SECRET_REALM', 'NEW_FEMALE_CULTIVATOR']);
const AWARD_BLOCK_RE = /(?:<!--\s*)?\[D20_TIANDAO_AWARD\]([\s\S]*?)\[\/D20_TIANDAO_AWARD\](?:\s*-->)?/gi;
const RUNTIME_SENTINEL = '__xiuxianD20TiandaoAwardRuntimeV116';
const COMMAND_SENTINEL = '__xiuxianD20TiandaoCommandsV116';

function normalizeText(value) {
    return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value) {
    return normalizeText(value).toLocaleLowerCase();
}

function clampTiandao(value) {
    const parsed = Number.parseInt(String(value ?? '0'), 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(MAX_TIANDAO, parsed));
}

function parseFields(body) {
    const fields = {};
    for (const rawLine of String(body ?? '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const separator = line.indexOf('=');
        if (separator <= 0) continue;
        const name = line.slice(0, separator).trim().toUpperCase();
        const value = line.slice(separator + 1).trim();
        if (!Object.hasOwn(fields, name)) fields[name] = value;
    }
    return fields;
}

export function parseTiandaoAwards(text) {
    if (typeof text !== 'string' || !text.includes('[D20_TIANDAO_AWARD]')) return [];
    const awards = [];
    AWARD_BLOCK_RE.lastIndex = 0;
    let match;
    while ((match = AWARD_BLOCK_RE.exec(text)) !== null) {
        const fields = parseFields(match[1]);
        const type = normalizeText(fields.TYPE).toUpperCase();
        const key = normalizeText(fields.KEY);
        const label = normalizeText(fields.LABEL) || key;
        let error = '';
        if (!AWARD_TYPES.has(type)) error = `未知奖励类型：${type || '空'}`;
        else if (!key) error = '奖励 KEY 为空';
        awards.push({
            ok: !error,
            error,
            type,
            key,
            label,
            id: !error ? `${type}:${normalizeKey(key)}` : '',
            raw: match[0],
        });
    }
    return awards;
}

export function stripTiandaoAwardBlocks(text) {
    if (typeof text !== 'string') return text;
    AWARD_BLOCK_RE.lastIndex = 0;
    return text.replace(AWARD_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function defaultNotify(type, message) {
    const toast = globalThis.toastr?.[type];
    if (typeof toast === 'function') toast(message, '修仙 D20');
    else console[type === 'error' ? 'error' : 'log'](`[修仙 D20] ${message}`);
}

function getLedger(metadata) {
    if (!metadata.xiuxianD20TiandaoAwards || typeof metadata.xiuxianD20TiandaoAwards !== 'object'
        || Array.isArray(metadata.xiuxianD20TiandaoAwards)) {
        metadata.xiuxianD20TiandaoAwards = {};
    }
    return metadata.xiuxianD20TiandaoAwards;
}

export async function processTiandaoAwardsByMessageId(getContext, messageId, {
    rerender = false,
    notify = defaultNotify,
} = {}) {
    const context = getContext();
    const index = Number(messageId);
    if (!Number.isInteger(index) || index < 0) return false;

    const message = context.chat?.[index];
    if (!message || message.is_user || message.is_system || typeof message.mes !== 'string') return false;

    const original = message.mes;
    const awards = parseTiandaoAwards(original);
    if (!awards.length) return false;

    // The model is instructed to emit award markers only after an achievement is
    // already a world fact. If it emits one in a fresh request/pending message,
    // strip the marker but do not grant or consume the achievement key.
    const stillPending = original.includes('[D20_REQUEST]') || original.includes('[D20_SETTLEMENT_PENDING]');
    const metadata = context.chatMetadata;
    if (!metadata) return false;
    metadata.variables ??= {};
    const ledger = getLedger(metadata);
    let current = clampTiandao(metadata.variables.d20_tiandao);
    let changed = false;
    let granted = 0;
    const labels = [];

    if (!stillPending) {
        for (const award of awards) {
            if (!award.ok) {
                notify('warning', `天道奖励标记无效：${award.error}`);
                continue;
            }
            if (Object.hasOwn(ledger, award.id)) continue;

            const before = current;
            if (current < MAX_TIANDAO) current += 1;
            const gained = current > before;
            ledger[award.id] = {
                type: award.type,
                key: award.key,
                label: award.label,
                status: gained ? 'awarded' : 'cap_reached',
                messageId: index,
                awardedAt: new Date().toISOString(),
            };
            changed = true;
            if (gained) {
                granted += 1;
                labels.push(award.label);
            }
        }
    }

    const cleaned = stripTiandaoAwardBlocks(original);
    if (cleaned !== original) {
        message.mes = cleaned;
        if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id)
            && message.swipes[message.swipe_id] === original) {
            message.swipes[message.swipe_id] = cleaned;
        }
        message.extra ??= {};
        message.extra.xiuxianD20TiandaoProcessed = true;
        changed = true;
        if (rerender && typeof context.updateMessageBlock === 'function') {
            context.updateMessageBlock(index, message);
        }
    }

    metadata.variables.d20_tiandao = current;
    context.saveMetadataDebounced?.();
    try {
        await context.saveChat?.();
    } catch (error) {
        console.warn('[修仙D20] 保存天道点奖励状态失败', error);
    }

    if (granted > 0) {
        notify('success', `☯ 天道点 +${granted}：${labels.join('、')}。当前 ${current}/${MAX_TIANDAO}`);
    } else if (!stillPending && awards.some(award => award.ok && ledger[award.id]?.status === 'cap_reached')) {
        notify('info', `☯ 天道点已达上限 ${MAX_TIANDAO}/${MAX_TIANDAO}；本次里程碑已记录，不重复奖励。`);
    }

    return changed;
}

export async function processLatestTiandaoAwards(getContext, options = {}) {
    const context = getContext();
    const chat = context.chat ?? [];
    for (let index = chat.length - 1; index >= 0; index--) {
        const message = chat[index];
        if (message?.is_user) break;
        if (message && !message.is_system) {
            return processTiandaoAwardsByMessageId(getContext, index, options);
        }
    }
    return false;
}

export function resetTiandaoAwards(getContext) {
    const context = getContext();
    const metadata = context.chatMetadata;
    if (!metadata) return 'false';
    metadata.variables ??= {};
    metadata.variables.d20_tiandao = 0;
    metadata.xiuxianD20TiandaoAwards = {};
    context.saveMetadataDebounced?.();
    return 'true';
}

export function registerTiandaoCommands(getContext, notify = defaultNotify) {
    if (globalThis[COMMAND_SENTINEL]) return;
    const { SlashCommandParser, SlashCommand } = getContext();
    if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) {
        throw new Error('SillyTavern SlashCommand API 不可用，无法安装天道点命令。');
    }
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'xiuxian-d20-tiandao-reset',
        callback: () => resetTiandaoAwards(getContext),
        returns: 'true when Tiandao points and automatic award ledger are reset',
        helpString: '重置天道点与自动奖励去重记录。通常仅由 D20 初始化使用。',
    }));
    globalThis[COMMAND_SENTINEL] = true;
    notify('info', '天道点自动奖励机制已加载。');
}

export function installTiandaoAwardRuntime(getContext, notify = defaultNotify) {
    if (globalThis[RUNTIME_SENTINEL]) return;
    const context = getContext();
    const eventSource = context.eventSource;
    const events = context.eventTypes ?? context.event_types;
    if (!eventSource || !events) {
        console.warn('[修仙D20] 无法挂载天道点自动奖励：事件 API 不可用。');
        return;
    }

    if (events.MESSAGE_RECEIVED) {
        eventSource.on(events.MESSAGE_RECEIVED, async (messageId) => {
            await processTiandaoAwardsByMessageId(getContext, messageId, { rerender: false, notify });
        });
    }
    const processAfterGeneration = async () => {
        await processLatestTiandaoAwards(getContext, { rerender: true, notify });
    };
    if (events.GENERATION_ENDED) eventSource.on(events.GENERATION_ENDED, processAfterGeneration);
    if (events.GENERATION_STOPPED) eventSource.on(events.GENERATION_STOPPED, processAfterGeneration);

    globalThis[RUNTIME_SENTINEL] = true;
}
