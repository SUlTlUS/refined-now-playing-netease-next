const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { parseVorbis, parseID3, readEmbedded } = require('../src/local-lyrics.js');

const lrc = '[00:01.250]本地歌词第一行\n[00:02.500]本地歌词第二行';
const little = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const comment = Buffer.from('LYRICS=' + lrc);
const vorbis = Buffer.concat([little(0), little(1), little(comment.length), comment]);
function frame(id, body, version = 3) {
  const header = Buffer.alloc(10);
  header.write(id);
  if (version === 4) {
    let size = body.length;
    for (let i = 7; i >= 4; i--) { header[i] = size & 127; size >>>= 7; }
  } else header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

test('FLAC Vorbis comments preserve timed UTF-8 lyrics', () => {
  assert.equal(parseVorbis(vorbis), lrc);
});
test('truncated FLAC comments do not read beyond the metadata block', () => {
  assert.equal(parseVorbis(vorbis.subarray(0, 15)), '');
});
test('MP3 ID3v2.3 USLT supports UTF-8 lyrics', () => {
  assert.equal(parseID3(frame('USLT', Buffer.concat([Buffer.from([3, 101, 110, 103, 0]), Buffer.from(lrc)])), 3), lrc);
});
test('MP3 ID3v2.4 USLT supports UTF-16 lyrics', () => {
  const body = Buffer.concat([Buffer.from([1, 122, 104, 111, 255, 254, 0, 0, 255, 254]), Buffer.from(lrc, 'utf16le')]);
  assert.equal(parseID3(frame('USLT', body, 4), 4), lrc);
});
test('MP3 TXXX supports the LYRICS field', () => {
  assert.equal(parseID3(frame('TXXX', Buffer.concat([Buffer.from([3]), Buffer.from('LYRICS\0' + lrc)])), 3), lrc);
});
test('incomplete ID3 frames return no lyrics', () => {
  assert.equal(parseID3(Buffer.from('incomplete'), 3), '');
});
test('FLAC reader skips artwork and audio while locating lyrics', async () => {
  function block(type, body, last = false) {
    const header = Buffer.alloc(4);
    header[0] = type | (last ? 128 : 0);
    header.writeUIntBE(body.length, 1, 3);
    return Buffer.concat([header, body]);
  }
  const fixture = Buffer.concat([Buffer.from('fLaC'), block(6, Buffer.alloc(100000)), block(4, vorbis, true)]);
  let bytesRead = 0;
  assert.equal(await readEmbedded(async (at, size) => { bytesRead += size; return fixture.subarray(at, at + size); }), lrc);
  assert.ok(bytesRead < 1000);
});

function runtime(initialPlaying, readFile = async () => new Blob([lrc])) {
  let state = { playing: initialPlaying };
  const callbacks = [], updates = [];
  const store = { getState: () => state, subscribe: cb => callbacks.push(cb) };
  const window = { onProcessLyrics: (value, id) => updates.push({ value, id }) };
  const document = { getElementById: () => ({ _reactRootContainer: { _internalRoot: { current: { memoizedProps: { store } } } } }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/local-lyrics.js'), 'utf8'), {
    window, document, TextDecoder, Uint8Array, DataView, Blob, console, setInterval, clearInterval,
    betterncm: { fs: { exists: async () => true, readFile } }
  });
  return { window, updates, setPlaying: playing => { state = { playing }; callbacks.forEach(cb => cb()); } };
}
const localPlaying = (filename = 'fixture.flac') => ({ trackFileType: 'local', resourceTrackId: filename, onlineResourceId: '', curPlaying: { localTrack: { filename, encryptFile: false } } });

test('online playback retains the existing lyric fetcher and options', async () => {
  const { window } = runtime({ trackFileType: 'online' });
  const options = { signal: new AbortController().signal };
  const raw = { lrc: { lyric: 'online fixture' } };
  const result = await window.rnpLocalLyricsBridge.fetchLyrics('123', options, (id, receivedOptions) => {
    assert.equal(id, '123'); assert.equal(receivedOptions, options); return raw;
  });
  assert.equal(result, raw);
});
test('local playback reads a sidecar without sending a local ID to the online API', async () => {
  const { window } = runtime(localPlaying());
  const result = await window.rnpLocalLyricsBridge.fetchLyrics('local-hash', {}, () => { throw Error('Unexpected online fetch'); });
  assert.equal(result.lrc.lyric, lrc);
  assert.equal(result.source.name, 'Local');
});
test('late local reads do not overwrite lyrics after switching tracks', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const instance = runtime(localPlaying(), () => pending);
  const result = instance.window.rnpLocalLyricsBridge.fetchLyrics('fixture.flac', {}, () => { throw Error('Unexpected online fetch'); });
  instance.setPlaying({ trackFileType: 'online', resourceTrackId: '123' });
  finish(new Blob([lrc]));
  assert.equal(await result, null);
  await Promise.resolve();
  assert.ok(!instance.updates.some(update => update.value.lrc.lyric === lrc));
});
test('aborted local fetches do not emit a response', async () => {
  const { window } = runtime(localPlaying());
  const controller = new AbortController(); controller.abort();
  assert.equal(await window.rnpLocalLyricsBridge.fetchLyrics('fixture.flac', { signal: controller.signal }, () => null), null);
});

function lyricAPI(playing, payload) {
  const state = { playing, host: { uid: '42' } };
  const store = { getState: () => state, subscribe: () => {} };
  const document = { getElementById: () => ({ _reactRootContainer: { _internalRoot: { current: { child: { child: { memoizedProps: { store } } } } } } }) };
  const calls = [];
  const context = {
    module: { exports: {} }, document, window: { APP_CONF: { domain: 'https://music.163.com' } }, URLSearchParams, console,
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => payload }; }
  };
  const source = fs.readFileSync(require.resolve('../src/ncm-compat.js'), 'utf8').replace(/\bexport\s+(?=const\b)/g, '');
  vm.runInNewContext(source + '\nmodule.exports = { fetchLyricsBySongId };', context);
  return { ...context.module.exports, calls };
}
test('personal cloud uploads use the cloud lyric endpoint and normalize string LRC', async () => {
  const signal = new AbortController().signal;
  const api = lyricAPI({ resourceTrackId: '123', onlineResourceId: '123', curPlaying: { track: { songType: 1 } } }, { code: 200, lrc, tlyric: 'translation fixture' });
  const lyrics = await api.fetchLyricsBySongId('123', { signal });
  const url = new URL(api.calls[0].url);
  assert.equal(url.pathname, '/api/cloud/lyric/get');
  assert.equal(url.searchParams.get('songId'), '123');
  assert.equal(url.searchParams.get('userId'), '42');
  assert.equal(api.calls[0].options.signal, signal);
  assert.equal(lyrics.lrc.lyric, lrc);
  assert.equal(lyrics.tlyric.lyric, 'translation fixture');
});
test('ordinary online songs retain the regular lyric endpoint and payload', async () => {
  const payload = { code: 200, lrc: { lyric: 'online fixture' } };
  const api = lyricAPI({ resourceTrackId: '123', onlineResourceId: '123', curPlaying: { track: { songType: 0 } } }, payload);
  assert.equal(await api.fetchLyricsBySongId('123'), payload);
  assert.equal(new URL(api.calls[0].url).pathname, '/api/song/lyric/v1');
});
test('cloud playback does not change the endpoint for a different requested song', async () => {
  const api = lyricAPI({ resourceTrackId: '123', onlineResourceId: '123', curPlaying: { track: { songType: 1 } } }, { code: 200 });
  await api.fetchLyricsBySongId('456');
  assert.equal(new URL(api.calls[0].url).pathname, '/api/song/lyric/v1');
});

function lyricProvider({ ready = true, fetcher = async id => ({ lrc: { lyric: id } }) } = {}) {
  let state = { playing: { resourceTrackId: '123', trackFileType: 'online' }, host: { uid: '42' } };
  const callbacks = [], events = [], timeouts = new Map(), intervals = new Map();
  let timerId = 0;
  const store = { getState: () => state, subscribe: cb => callbacks.push(cb) };
  const window = {
    rnpLocalLyricsBridge: { fetchLyrics: (id, options, fallback) => fallback(id, options) },
    addEventListener: () => {},
    setTimeout: fn => { timeouts.set(++timerId, fn); return timerId; }
  };
  const context = {
    window, console: { group() {}, groupEnd() {}, log() {}, debug() {} }, AbortController,
    document: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    parseLyric: original => [{ originalLyric: original }], cyrb53: value => value,
    getNCMStore: () => ready ? store : null, getPlayingSongId: () => state.playing.resourceTrackId,
    appendRegisterCall: () => {}, fetchLyricsBySongId: fetcher,
    setTimeout: window.setTimeout, clearTimeout: id => timeouts.delete(id),
    setInterval: fn => { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id)
  };
  const source = fs.readFileSync(require.resolve('../src/lyric-provider.js'), 'utf8').replace(/^import .*;\r?$/gm, '');
  vm.runInNewContext(source, context);
  return {
    window, events,
    installStore() { ready = true; Array.from(intervals.values()).forEach(fn => fn()); },
    setPlaying(playing) { state = { ...state, playing }; callbacks.forEach(cb => cb()); },
    async flush() {
      // Run each queued timer and settle the provider's asynchronous processing.
      for (let i = 0; i < 10; i++) {
        const pending = Array.from(timeouts.values()); timeouts.clear();
        pending.forEach(fn => fn());
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      }
    }
  };
}
test('startup fetches restored lyrics when the React store appears after plugin load', async () => {
  const calls = [];
  const provider = lyricProvider({ ready: false, fetcher: async id => { calls.push(id); return { lrc: { lyric: 'restored lyric' } }; } });
  await provider.flush(); assert.equal(calls.length, 0);
  provider.installStore(); await provider.flush();
  assert.deepEqual(calls, ['123']);
  assert.equal(provider.window.currentLyrics.lyrics[0].originalLyric, 'restored lyric');
});
test('cloud metadata arriving for the same song triggers a new fetch; progress does not', async () => {
  const calls = [];
  const provider = lyricProvider({ fetcher: async id => { calls.push(id); return { lrc: { lyric: id } }; } });
  await provider.flush();
  const cloud = { resourceTrackId: '123', trackFileType: 'online', curPlaying: { track: { songType: 1 } } };
  provider.setPlaying(cloud); await provider.flush(); assert.equal(calls.length, 2);
  provider.setPlaying({ ...cloud, position: 1000 }); await provider.flush(); assert.equal(calls.length, 2);
});
test('switching online tracks aborts pending lyrics and prevents stale results', async () => {
  let finish, firstSignal;
  const provider = lyricProvider({ fetcher: (id, { signal }) => {
    if (id === '123') { firstSignal = signal; return new Promise(resolve => { finish = resolve; }); }
    return Promise.resolve({ lrc: { lyric: 'new track lyric' } });
  } });
  await provider.flush();
  provider.setPlaying({ resourceTrackId: '456', trackFileType: 'online' });
  assert.equal(firstSignal.aborted, true);
  finish({ lrc: { lyric: 'stale lyric' } }); await provider.flush();
  assert.equal(provider.window.currentLyrics.lyrics[0].originalLyric, 'new track lyric');
  assert.ok(!provider.events.some(event => event.detail.lyrics[0].originalLyric === 'stale lyric'));
});
