import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { VERSION } from '../version.js';

// Execute the actual installer/wrapper with the public ST interfaces mocked.
// No user's preset or chat is required, and there are no network dependencies.
async function boot(version, { failSave = false } = {}) {
    const root = new URL('../', import.meta.url);
    const qrPayload = JSON.parse(await readFile(new URL('assets/quickreply.json', root)));
    const regexes = JSON.parse(await readFile(new URL('assets/regexes.json', root)));
    const customRegex = { scriptName: '用户其他规则', findRegex: 'keep', id: 'custom' };
    const customQr = { label: '用户自定义按钮', message: 'keep', id: 999 };
    let saves = 0;
    const set = {
        qrList: [...qrPayload.qrList.map(qr => ({ ...qr, message: 'legacy QR' })), customQr],
        save: async () => { if (failSave) throw new Error('simulated save failure'); saves++; },
    };
    let legacySaves = 0;
    const legacyExtra = { id: 888, label: '保留旧集合自定义项', message: 'keep legacy', executeOnAi: true };
    const legacy = {
        qrList: [...qrPayload.qrList.map(qr => ({ ...qr, message: 'legacy QR' })), legacyExtra],
        save: async () => { legacySaves++; },
    };
    const commands = {};
    const preset = Object.freeze({ name: '第三方预设', prompts: Object.freeze(['keep']) });
    const settings = {
        xiuxianD20Installer: { installedVersion: version },
        regex: [...regexes.map(rule => ({ ...rule, findRegex: 'legacy Regex' })), customRegex],
    };
    const metadata = { variables: { d20_pending: 1, d20_mod: -2, d20_lastroll: 18, d20_tiandao: 4 } };
    const st = {
        extensionSettings: settings, extensionPrompts: {}, chatMetadata: metadata, chat: [],
        saveSettingsDebounced() {}, saveMetadataDebounced() {},
        setExtensionPrompt(key, value) { st.extensionPrompts[key] = { value }; },
        eventSource: { on() {} }, eventTypes: {},
        SlashCommandParser: { addCommandObject(command) { commands[command.name] = command; } },
        SlashCommand: { fromProps: props => props },
        // The extension must never use a preset writer.
        getPresetManager() { throw new Error('must not access preset manager'); },
    };
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, error() {} }, URL, structuredClone,
        document: { querySelector: () => null },
        SillyTavern: { getContext: () => st },
        quickReplyApi: {
            getSetByName: name => name === '修仙D20 ' ? legacy : set,
            listSets: () => ['修仙D20', '修仙D20 '],
            listGlobalSets: () => ['修仙D20'], settings: { isEnabled: true },
        },
        fetch: async url => ({ ok: true, text: () => readFile(url, 'utf8'), json: async () => JSON.parse(await readFile(url, 'utf8')) }),
    });
    const modules = new Map();
    const scriptModule = new vm.SyntheticModule(['extension_prompt_types', 'extension_prompt_roles'], function () {
        this.setExport('extension_prompt_types', { IN_PROMPT: 0, IN_CHAT: 1 });
        this.setExport('extension_prompt_roles', { SYSTEM: 0 });
    }, { context: sandbox });
    await scriptModule.link(() => {});
    await scriptModule.evaluate();
    async function load(url) {
        if (modules.has(url.href)) return modules.get(url.href);
        const mod = new vm.SourceTextModule(await readFile(url, 'utf8'), {
            context: sandbox, identifier: url.href,
            initializeImportMeta(meta) { meta.url = url.href; },
            importModuleDynamically: async spec => {
                assert.equal(spec, '/script.js');
                return scriptModule;
            },
        });
        modules.set(url.href, mod);
        await mod.link((spec, parent) => load(new URL(spec, parent.identifier)));
        return mod;
    }
    const wrapper = await load(new URL('index-v1.1.js', root));
    await wrapper.evaluate();
    await wrapper.namespace.init();
    return { st, settings, set, legacy, legacyExtra, customQr, customRegex, preset, commands,
        saves: () => saves, legacySaves: () => legacySaves, init: wrapper.namespace.init };
}

test('upgrade v1.1.4 actually migrates existing Regex and QR without touching preset or pending fate', async () => {
    const result = await boot('1.1.4');
    assert.equal(result.settings.xiuxianD20Installer.installedVersion, VERSION);
    assert.equal(result.saves(), 1);
    assert.match(result.set.qrList.find(qr => qr.id === 24).message, /^\/xiuxian-d20-prepare/);
    assert.ok(result.settings.regex.slice(0, 4).every(rule => rule.findRegex.includes('D20_REQUEST')));
    assert.equal(result.set.qrList.at(-1), result.customQr);
    assert.equal(result.settings.regex.at(-1), result.customRegex);
    assert.deepEqual(result.preset.prompts, ['keep']);
    assert.deepEqual(result.st.chatMetadata.variables, { d20_pending: 1, d20_mod: -2, d20_lastroll: 18, d20_tiandao: 4 });
    assert.ok(result.commands['xiuxian-d20-prepare']);
    assert.equal(result.legacySaves(), 1);
    assert.equal(result.legacy.qrList.find(qr => qr.id === 24).executeOnAi, false);
    assert.match(result.legacy.qrList.find(qr => qr.id === 24).message, /^\/xiuxian-d20-prepare/);
    assert.equal(result.legacy.qrList.at(-1), result.legacyExtra);
    assert.equal(result.legacyExtra.executeOnAi, true);
    await result.init();
    assert.equal(result.saves(), 1, 'a second init must not force another installation');
});

test('failed migration must not falsely stamp the new installed version', async () => {
    const result = await boot('1.1.4', { failSave: true });
    assert.equal(result.settings.xiuxianD20Installer.installedVersion, '1.1.4');
    assert.match(result.settings.xiuxianD20Installer.lastError, /simulated save failure/);
});

test('manifest, installer and package versions agree', async () => {
    for (const path of ['../manifest.json', '../package.json']) {
        assert.equal(JSON.parse(await readFile(new URL(path, import.meta.url))).version, VERSION);
    }
});
