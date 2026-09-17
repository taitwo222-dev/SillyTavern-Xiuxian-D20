import { parseD20Request } from './request-parser.js';

function latestAssistant(context) {
    for (let index = (context.chat?.length ?? 0) - 1; index >= 0; index--) {
        const message = context.chat[index];
        // Do not reuse an old assistant request after a new user turn.
        if (message?.is_user) break;
        if (message && !message.is_system && typeof message.mes === 'string') return { index, message };
    }
    return null;
}

export function inspectLatestRequest(context) {
    const source = latestAssistant(context);
    return { messageId: source?.index ?? null, swipeId: source?.message.swipe_id ?? null,
        ...parseD20Request(source?.message.mes) };
}

export function prepareLatestRequest(context, warn = () => {}) {
    const metadata = context.chatMetadata;
    if (!metadata) throw new Error('聊天变量不可用，D20 请求未锁定。');
    if (String(metadata.variables?.d20_pending) === '1') return 'false';
    const result = inspectLatestRequest(context);
    if (result.code === 'no_request') return 'false';
    metadata.xiuxianD20RequestDiagnostic = result;
    context.saveMetadataDebounced?.();
    if (!result.ok) {
        warn(`D20 尚未投骰：${result.error} 请编辑原请求或重新生成；“测试DETAIL”可查看诊断。`);
        return 'false';
    }
    // Commit all four values together only after successful validation. Direct
    // message access avoids Regex name collisions and STscript macro expansion.
    metadata.variables ??= {};
    Object.assign(metadata.variables, {
        d20_action: result.action,
        d20_dc: result.dc,
        d20_mod: result.mod,
        d20_detail: result.detail,
        d20_request_error: '',
    });
    context.saveMetadataDebounced?.();
    return 'true';
}

export function formatRequestDiagnostic(context) {
    const result = inspectLatestRequest(context);
    const vars = context.chatMetadata?.variables ?? {};
    const locked = String(vars.d20_pending) === '1';
    const description = result.ok
        ? `原始请求 MOD=${result.mod}；DETAIL 合计=${result.sum}\nACTION=${result.action}\nDETAIL=${result.detail}`
        : `请求校验：${result.error}`;
    return `【D20请求诊断】\n消息=${result.messageId ?? '无'}\n${description}\n缓存 MOD=${vars.d20_mod ?? '未设置'}；待结算=${locked ? '是' : '否'}\n${locked ? '现有骰点已锁定，不会重算修正。' : '只检查，不投骰、不修改缓存。'}\n${result.rawRequest ?? ''}`;
}

export function registerRequestCommands(getContext, notify) {
    const { SlashCommandParser, SlashCommand } = getContext();
    if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) {
        throw new Error('SillyTavern SlashCommand API 不可用，无法安装 D20 请求校验器。');
    }
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'xiuxian-d20-prepare',
        callback: () => prepareLatestRequest(getContext(), message => notify('warning', message)),
        returns: 'true only when a complete D20 request is validated and locked',
        helpString: '校验最新原始 D20 请求并锁定 ACTION/DC/MOD/DETAIL；不投骰，不自动补零。',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'xiuxian-d20-diagnose',
        callback: () => {
            const report = formatRequestDiagnostic(getContext());
            // Avoid treating a model-supplied ACTION/DETAIL as toast HTML.
            const escaped = report.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            notify('info', escaped);
            return report;
        },
        helpString: '查看原始请求、修正合计及缓存的差异；不改动已锁定结果。',
    }));
}
