// Pure protocol validation. Never infer a modifier from prose, roll dice, or
// repair a malformed request by substituting zero.
const normalizeNumber = value => value.trim()
    .replace(/[０-９]/g, char => String(char.charCodeAt(0) - 0xff10))
    .replace(/[＋]/g, '+').replace(/[－−﹣]/g, '-');

function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
}

function integer(value, field) {
    const normalized = normalizeNumber(value);
    if (!/^[+-]?\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
        fail('invalid_integer', `${field} 必须是完整整数，不能留空或用文字代替。`);
    }
    return Number(normalized);
}

export function parseDetail(detail) {
    // Zero is valid: either real positive/negative terms cancel, or the referee
    // explicitly explains why this action has no relevant modifiers.
    const neutral = detail.match(/^无(?:直接相关|有效|额外)?修正(?:因素)?(?:[（(][+＋\-－−]?0[)）])?[：:]\s*(\S[\s\S]*)$/);
    if (neutral) return { factors: [], sum: 0, neutralReason: neutral[1] };

    const factors = detail.split(/[,，;；、\n]+/).map(part => part.trim()).filter(Boolean).map(part => {
        const match = part.match(/^(.*?)\s*[（(]\s*([+＋\-－−﹣]?[0-9０-９]+)\s*[)）]$/)
            ?? part.match(/^(.*?)\s*([+＋\-－−﹣][0-9０-９]+)$/);
        if (!match || !match[1].trim()) {
            fail('invalid_detail', 'DETAIL 每项须为“具体因素(+整数)”或“具体因素(-整数)”，不能省略来源或数值。');
        }
        const value = integer(match[2], 'DETAIL 修正');
        if (value !== 0 && !/^[+＋\-－−﹣]/.test(match[2])) {
            fail('unsigned_detail', 'DETAIL 的非零修正必须明确写出正负号。');
        }
        return { source: match[1].trim(), value };
    });
    if (!factors.length) fail('empty_detail', 'DETAIL 不能为空。');
    const names = factors.map(factor => factor.source.replace(/\s+/g, ''));
    if (new Set(names).size !== names.length) fail('duplicate_factor', 'DETAIL 中有重复来源，请在投骰前核对是否重复计算。');
    const sum = factors.reduce((total, factor) => total + factor.value, 0);
    if (!Number.isSafeInteger(sum)) fail('invalid_sum', 'DETAIL 合计超出安全整数范围。');
    if (factors.every(factor => factor.value === 0)) {
        fail('unexplained_zero', 'DETAIL 全是零值占位项。请核对既有能力、装备、状态和环境；确实无修正时写“无直接相关修正(0)：具体原因”。不会强行改成非零。');
    }
    return { factors, sum, neutralReason: null };
}

export function parseD20Request(text) {
    const source = String(text ?? '')
        .replace(/<(think_nya~?|think|thinking|analysis)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<(?:think_nya~?|think|thinking|analysis)(?:\s[^>]*)?>[\s\S]*$/gi, '');
    const blocks = [...source.matchAll(/\[D20_REQUEST\]([\s\S]*?)\[\/D20_REQUEST\]/g)];
    if (!source.includes('[D20_REQUEST]')) return { ok: false, code: 'no_request', error: '最新 AI 消息没有正式 D20 请求。' };
    const rawRequest = blocks.map(match => match[0]).join('\n');
    try {
        const starts = source.match(/\[D20_REQUEST\]/g) ?? [];
        const ends = source.match(/\[\/D20_REQUEST\]/g) ?? [];
        if (blocks.length !== 1 || starts.length !== 1 || ends.length !== 1) {
            fail('ambiguous_request', '每次只能有一个完整 D20_REQUEST；请求未闭合或出现多个请求时不投骰。');
        }
        const fields = Object.create(null);
        let active = null;
        for (const line of blocks[0][1].replace(/\r\n?/g, '\n').split('\n')) {
            if (!line.trim()) continue;
            const match = line.match(/^[ \t]*(ACTION|DC|MOD|DETAIL)[ \t]*[=＝][ \t]*(.*)$/);
            if (match) {
                active = match[1];
                if (Object.hasOwn(fields, active)) fail('duplicate_field', `${active} 字段重复，无法确定应锁定哪一个值。`);
                fields[active] = match[2].trim();
            } else if (active === 'DETAIL' && !/^[A-Z_]+\s*=/.test(line.trim())) {
                fields.DETAIL += '\n' + line.trim();
            } else {
                fail('invalid_field', '请求内存在无法识别的字段或格式。');
            }
        }
        for (const field of ['ACTION', 'DC', 'MOD', 'DETAIL']) {
            if (!fields[field]?.trim()) fail('missing_field', `${field} 缺失或为空；未锁定完整条件，不能投骰。`);
        }
        const dc = integer(fields.DC, 'DC');
        if (dc < 5 || dc > 30) {
            fail('dc_out_of_range', `DC=${dc} 超出合法范围 5—30。若客观难度需要高于30，则当前条件下不应投骰，应直接判定无法完成或先改变条件后重新评估。`);
        }
        const mod = integer(fields.MOD, 'MOD');
        const breakdown = parseDetail(fields.DETAIL);
        if (breakdown.sum !== mod) fail('sum_mismatch', `DETAIL 合计为 ${breakdown.sum}，但 MOD 为 ${mod}；请在投骰前核对。`);
        return { ok: true, rawRequest, action: fields.ACTION, dc, mod, detail: fields.DETAIL, ...breakdown };
    } catch (error) {
        return { ok: false, rawRequest, code: error.code ?? 'invalid_request', error: error.message };
    }
}
