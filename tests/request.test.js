import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseD20Request } from '../request-parser.js';
import { prepareLatestRequest, formatRequestDiagnostic } from '../request-runtime.js';
import { stripPendingInteractionBlocks } from '../pending-output.js';

const request = (mod = '+3', detail = '熟练控火(+4)，神识疲惫(-1)', action = '控制丹火') =>
    `<!--\n[D20_REQUEST]\nACTION=${action}\nDC=12\nMOD=${mod}\nDETAIL=${detail}\n[/D20_REQUEST]\n-->`;
const context = text => ({ chat: [{ mes: text, is_user: false }], chatMetadata: { variables: {} }, saveMetadataDebounced() {} });

test('use the actual request, not draft MOD=0/DETAIL before it', () => {
    const text = '<think_nya~>草稿 MOD=0\nDETAIL=待评估(+0)</think_nya~>\n' + request();
    const parsed = parseD20Request(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mod, 3);
    assert.equal(parsed.detail, '熟练控火(+4)，神识疲惫(-1)');
});

test('ignore complete draft requests inside reasoning; reject ambiguous formal requests', () => {
    const text = `<think_nya~>${request('0', '待评估(+0)')}</think_nya~>\n${request()}`;
    assert.equal(parseD20Request(text).mod, 3);
    assert.equal(parseD20Request(request() + request()).code, 'ambiguous_request');
    assert.equal(parseD20Request('<think_nya~>' + request()).code, 'no_request');
});

test('preserve both sides of a genuine net zero, and an explained neutral action', () => {
    const cancelled = parseD20Request(request('0', '熟练控火(+2)，神识疲惫(-2)'));
    assert.equal(cancelled.ok, true);
    assert.deepEqual(cancelled.factors.map(factor => factor.value), [2, -2]);
    const neutral = parseD20Request(request('0', '无直接相关修正(0)：普通器具与正常室温均为本次基础难度的基准条件'));
    assert.equal(neutral.ok, true);
    assert.equal(neutral.mod, 0);
});

test('the all-zero screenshot-style breakdown requires review before dice, never invented bonuses', () => {
    const parsed = parseD20Request(request('0', '初次炼制基础聚气散+0，环境稳定+0'));
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'unexplained_zero');
});

test('reject mismatch, empty ACTION, missing MOD, junk numbers, unsigned nonzero and duplicate sources', () => {
    const cases = [
        [request('0'), 'sum_mismatch'],
        [request('+3', undefined, ''), 'missing_field'],
        [request().replace('MOD=+3\n', ''), 'missing_field'],
        [request('3abc'), 'invalid_integer'],
        [request('+3', '控火(3)'), 'unsigned_detail'],
        [request('+3', '控火(+2)，控火(+1)'), 'duplicate_factor'],
        [request().replace('MOD=+3', 'MOD=0\nMOD=+3'), 'duplicate_field'],
        [request().replace('[/D20_REQUEST]', ''), 'ambiguous_request'],
    ];
    for (const [text, expected] of cases) assert.equal(parseD20Request(text).code, expected, text);
});

test('multiline DETAIL, fullwidth signs/digits, CRLF and numbers in source names', () => {
    const text = request('＋３', '二阶丹炉（＋４）\n神识剩余30点（－１）').replaceAll('\n', '\r\n');
    const parsed = parseD20Request(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mod, 3);
    assert.equal(parseD20Request(request('-2', '神识疲惫(-2)')).mod, -2);
});

test('validation writes all four chat variables atomically and never expands text as STscript', () => {
    const action = '控制丹火 | /setvar key=unrelated 0 {{getvar::secret}}';
    const c = context(request('+3', undefined, action));
    assert.equal(prepareLatestRequest(c), 'true');
    assert.equal(c.chatMetadata.variables.d20_action, action);
    assert.equal(c.chatMetadata.variables.d20_mod, 3);
    assert.equal(c.chatMetadata.variables.unrelated, undefined);
    assert.equal(c.chatMetadata.variables.d20_lastroll, undefined);
    assert.equal(c.chatMetadata.variables.d20_pending, undefined);
});

test('invalid requests cannot overwrite prior values or permit the QR roll branch', () => {
    const c = context(request('0'));
    c.chatMetadata.variables = { d20_mod: -2, d20_detail: '旧伤(-2)', d20_tiandao: 4 };
    const before = structuredClone(c.chatMetadata.variables);
    assert.equal(prepareLatestRequest(c), 'false');
    assert.deepEqual(c.chatMetadata.variables, before);
    assert.equal(c.chatMetadata.xiuxianD20RequestDiagnostic.code, 'sum_mismatch');
});

test('existing pending results remain locked, and diagnostics do not mutate state', () => {
    const c = context(request());
    c.chatMetadata.variables = { d20_pending: 1, d20_mod: -2, d20_lastroll: 18, d20_tiandao: 2 };
    const before = structuredClone(c.chatMetadata);
    assert.equal(prepareLatestRequest(c), 'false');
    assert.match(formatRequestDiagnostic(c), /缓存 MOD=-2/);
    assert.deepEqual(c.chatMetadata, before);
});

test('do not reuse an old request after a new user message or consume a system result', () => {
    const c = context(request());
    c.chat.push({ is_user: true, mes: '下一步' }, { is_system: true, mes: '[D20_ACCEPT]' });
    assert.equal(prepareLatestRequest(c), 'false');
});

test('remove decorated cat UI while preserving preceding status and exact protocol bytes', () => {
    const status = '<details><summary>既有状态</summary>已有装备与技能</details>';
    const cat = '<details><summary>😺 <b>小猫之神的留言</b></summary>等候<details><summary>内层</summary>附言</details></details>';
    const cleaned = stripPendingInteractionBlocks(status + request() + cat + '<options>下一步</options>');
    assert.equal(cleaned, status + request());
});

test('streaming/unclosed UI never consumes a D20 request or a preceding status block', () => {
    const status = '<details><summary>状态</summary>装备</details>';
    assert.equal(stripPendingInteractionBlocks(status + request() + '<details><summary>小猫之神的留言</summary>未完'), status + request());
    const wrapped = `<options>${request()}</options>`;
    assert.equal(stripPendingInteractionBlocks(wrapped), wrapped);
    const ordinary = '<details><summary>小猫之神的留言</summary>已结算</details><options>下一步</options>';
    assert.equal(stripPendingInteractionBlocks(ordinary), ordinary);
});

test('standalone compatibility Regex extracts only fields inside a complete request', () => {
    const regexes = JSON.parse(readFileSync(new URL('../assets/regexes.json', import.meta.url)));
    const input = 'MOD=0\nDETAIL=未评估(+0)\n' + request();
    const expected = { ACTION: '控制丹火', DC: '12', MOD: '+3', DETAIL: '熟练控火(+4)，神识疲惫(-1)' };
    for (const rule of regexes) {
        const match = rule.findRegex.match(/^\/(.*)\/([a-z]*)$/s);
        const result = input.replace(new RegExp(match[1], match[2]), rule.replaceString);
        assert.equal(result.trim(), expected[rule.scriptName.split('提取')[1]]);
    }
});
