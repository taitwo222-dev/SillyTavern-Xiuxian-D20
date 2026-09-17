import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseTiandaoAwards,
    processTiandaoAwardsByMessageId,
    resetTiandaoAwards,
    stripTiandaoAwardBlocks,
} from '../tiandao-runtime.js';

const marker = (type, key, label = key) => `<!--\n[D20_TIANDAO_AWARD]\nTYPE=${type}\nKEY=${key}\nLABEL=${label}\n[/D20_TIANDAO_AWARD]\n-->`;

function makeContext(text, points = 0) {
    return {
        chat: [{ is_user: false, is_system: false, mes: text, swipes: [text], swipe_id: 0 }],
        chatMetadata: { variables: { d20_tiandao: points } },
        saveMetadataDebounced() {},
        async saveChat() {},
        updateMessageBlock() {},
    };
}

test('parse all three automatic award types and hide their machine blocks', () => {
    const text = [
        '正文',
        marker('BREAKTHROUGH', '筑基初期', '突破至筑基初期'),
        marker('SECRET_REALM', '青云秘境', '完成青云秘境'),
        marker('NEW_FEMALE_CULTIVATOR', '苏青璃', '征服苏青璃'),
    ].join('\n');
    const awards = parseTiandaoAwards(text);
    assert.deepEqual(awards.map(item => item.type), ['BREAKTHROUGH', 'SECRET_REALM', 'NEW_FEMALE_CULTIVATOR']);
    assert.equal(awards.every(item => item.ok), true);
    assert.equal(stripTiandaoAwardBlocks(text), '正文');
});

test('grant one point for a new milestone and never grant the same key twice', async () => {
    const text = `突破完成。\n${marker('BREAKTHROUGH', '筑基初期', '突破至筑基初期')}`;
    const context = makeContext(text, 0);
    const notices = [];
    const getContext = () => context;
    const notify = (type, message) => notices.push([type, message]);

    assert.equal(await processTiandaoAwardsByMessageId(getContext, 0, { notify }), true);
    assert.equal(context.chatMetadata.variables.d20_tiandao, 1);
    assert.equal(Object.keys(context.chatMetadata.xiuxianD20TiandaoAwards).length, 1);
    assert.equal(context.chat[0].mes, '突破完成。');
    assert.match(notices[0][1], /天道点 \+1/);

    // Simulate a later response trying to award the same realm again.
    const repeated = `再次确认。\n${marker('BREAKTHROUGH', '筑基初期', '突破至筑基初期')}`;
    context.chat.push({ is_user: false, is_system: false, mes: repeated, swipes: [repeated], swipe_id: 0 });
    await processTiandaoAwardsByMessageId(getContext, 1, { notify });
    assert.equal(context.chatMetadata.variables.d20_tiandao, 1);
    assert.equal(Object.keys(context.chatMetadata.xiuxianD20TiandaoAwards).length, 1);
});

test('different secret realms and female cultivators each award once, capped at five', async () => {
    const text = [
        marker('SECRET_REALM', '甲秘境', '完成甲秘境'),
        marker('SECRET_REALM', '乙秘境', '完成乙秘境'),
        marker('NEW_FEMALE_CULTIVATOR', '林月', '征服林月'),
    ].join('\n');
    const context = makeContext(text, 4);
    await processTiandaoAwardsByMessageId(() => context, 0, { notify() {} });
    assert.equal(context.chatMetadata.variables.d20_tiandao, 5);
    const records = Object.values(context.chatMetadata.xiuxianD20TiandaoAwards);
    assert.equal(records.length, 3);
    assert.equal(records.filter(item => item.status === 'awarded').length, 1);
    assert.equal(records.filter(item => item.status === 'cap_reached').length, 2);
});

test('never award a milestone while the same message is still a D20 request', async () => {
    const text = `[D20_REQUEST]\nACTION=突破\n[/D20_REQUEST]\n${marker('BREAKTHROUGH', '金丹初期', '突破至金丹初期')}`;
    const context = makeContext(text, 2);
    await processTiandaoAwardsByMessageId(() => context, 0, { notify() {} });
    assert.equal(context.chatMetadata.variables.d20_tiandao, 2);
    assert.deepEqual(context.chatMetadata.xiuxianD20TiandaoAwards, {});
    assert.equal(context.chat[0].mes.includes('[D20_TIANDAO_AWARD]'), false);
});

test('reset clears points and the automatic award ledger', () => {
    const context = makeContext('正文', 5);
    context.chatMetadata.xiuxianD20TiandaoAwards = { 'BREAKTHROUGH:筑基初期': { status: 'awarded' } };
    assert.equal(resetTiandaoAwards(() => context), 'true');
    assert.equal(context.chatMetadata.variables.d20_tiandao, 0);
    assert.deepEqual(context.chatMetadata.xiuxianD20TiandaoAwards, {});
});
