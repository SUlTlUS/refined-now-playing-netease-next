/* Local lyric compatibility for RefinedNowPlayingNext 3.0.2 / NCM 3.x.
 * Reads existing LRC files and FLAC/MP3 tags through BetterNCM on localhost.
 * Does not change audio files or send their contents to an online service.
 */
(() => {
  'use strict';
  const MAX_TAG_BYTES = 16 * 1024 * 1024;
  const text = (bytes, encoding = 'utf-8') => new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '').replace(/\0+$/, '');
  const u32 = (bytes, at, little = false) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, little);
  const syncsafe = (bytes, at) => ((bytes[at] & 127) << 21) | ((bytes[at + 1] & 127) << 14) | ((bytes[at + 2] & 127) << 7) | (bytes[at + 3] & 127);
  const lyricKey = key => /^(lyrics?|unsyncedlyrics|syncedlyrics|lrc)$/i.test(key.replace(/[ _-]/g, ''));
  const parseVorbis = bytes => {
    if (bytes.length < 8) return '';
    let at = 4 + u32(bytes, 0, true);
    if (at + 4 > bytes.length) return '';
    const count = u32(bytes, at, true);
    at += 4;
    let result = '';
    for (let i = 0; i < count && at + 4 <= bytes.length; i++) {
      const size = u32(bytes, at, true);
      at += 4;
      if (at + size > bytes.length) break;
      const comment = text(bytes.subarray(at, at + size));
      at += size;
      const equals = comment.indexOf('=');
      if (equals < 0 || !lyricKey(comment.slice(0, equals))) continue;
      const value = comment.slice(equals + 1).trim();
      if (value && (!result || /\[\d+:\d+/.test(value))) result = value;
    }
    return result;
  };
  const terminator = (bytes, at, wide) => {
    for (let i = at; i < bytes.length; i += wide ? 2 : 1) {
      if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) return i;
    }
    return bytes.length;
  };
  const id3Text = (bytes, encoding, hint) => {
    if (encoding === 0) return text(bytes, 'windows-1252');
    if (encoding === 3) return text(bytes);
    const big = encoding === 2 || (bytes[0] === 254 && bytes[1] === 255) || hint === 'utf-16be';
    return text(bytes, big ? 'utf-16be' : 'utf-16le');
  };
  const unsync = bytes => {
    const result = [];
    for (let i = 0; i < bytes.length; i++) {
      result.push(bytes[i]);
      if (bytes[i] === 255 && bytes[i + 1] === 0) i++;
    }
    return Uint8Array.from(result);
  };
  const timestamp = milliseconds => {
    const ms = Math.max(0, Math.round(milliseconds));
    return `[${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}]`;
  };
  const parseID3 = (input, version, flags = 0) => {
    const bytes = flags & 128 && version < 4 ? unsync(input) : input;
    let at = 0;
    if (flags & 64 && version >= 3) {
      if (bytes.length < 4) return '';
      at = version === 4 ? syncsafe(bytes, 0) : u32(bytes, 0) + 4;
    }
    let result = '';
    const headerSize = version === 2 ? 6 : 10;
    while (at + headerSize <= bytes.length) {
      const id = text(bytes.subarray(at, at + (version === 2 ? 3 : 4)));
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const size = version === 2 ? bytes[at + 3] * 65536 + bytes[at + 4] * 256 + bytes[at + 5] : version === 4 ? syncsafe(bytes, at + 4) : u32(bytes, at + 4);
      const frameFlags = version === 2 ? 0 : bytes[at + 9];
      const start = at + headerSize;
      at = start + size;
      if (!size || at > bytes.length) break;
      if (version === 3 && frameFlags & 192 || version === 4 && frameFlags & 12) continue;
      let frame = bytes.subarray(start, at);
      if (version === 4 && (flags & 128 || frameFlags & 2)) frame = unsync(frame);
      if (version === 3 && frameFlags & 32 || version === 4 && frameFlags & 64) frame = frame.subarray(1);
      if (version === 4 && frameFlags & 1) frame = frame.subarray(4);
      if (!frame.length) continue;
      const encoding = frame[0], wide = encoding === 1 || encoding === 2;
      let value = '';
      if (id === 'USLT' || id === 'ULT') {
        const end = terminator(frame, 4, wide);
        const hint = frame[4] === 254 && frame[5] === 255 ? 'utf-16be' : undefined;
        value = id3Text(frame.subarray(end + (wide ? 2 : 1)), encoding, hint);
      } else if (id === 'TXXX' || id === 'TXX') {
        const end = terminator(frame, 1, wide);
        if (lyricKey(id3Text(frame.subarray(1, end), encoding))) value = id3Text(frame.subarray(end + (wide ? 2 : 1)), encoding);
      } else if ((id === 'SYLT' || id === 'SLT') && frame[4] === 2) {
        let pos = terminator(frame, 6, wide) + (wide ? 2 : 1);
        const lines = [];
        while (pos < frame.length) {
          const end = terminator(frame, pos, wide), timeAt = end + (wide ? 2 : 1);
          if (timeAt + 4 > frame.length) break;
          lines.push(timestamp(u32(frame, timeAt)) + id3Text(frame.subarray(pos, end), encoding));
          pos = timeAt + 4;
        }
        value = lines.join('\n');
      }
      if (value.trim() && (!result || /\[\d+:\d+/.test(value))) result = value.trim();
    }
    return result;
  };
  const readEmbedded = async read => {
    const header = await read(0, 10);
    if (text(header.subarray(0, 4)) === 'fLaC') {
      let at = 4;
      for (let i = 0; i < 128; i++) {
        const block = await read(at, 4);
        if (block.length !== 4) break;
        const size = block[1] * 65536 + block[2] * 256 + block[3];
        if ((block[0] & 127) === 4) {
          if (size > MAX_TAG_BYTES) return '';
          const lyric = parseVorbis(await read(at + 4, size));
          if (lyric) return lyric;
        }
        at += 4 + size;
        if (block[0] & 128) break;
      }
    } else if (text(header.subarray(0, 3)) === 'ID3' && [2, 3, 4].includes(header[3])) {
      const size = syncsafe(header, 6);
      if (size <= MAX_TAG_BYTES) return parseID3(await read(10, size), header[3], header[5]);
    }
    return '';
  };
  const parser = { parseVorbis, parseID3, readEmbedded, timestamp };
  if (typeof window === 'undefined') { module.exports = parser; return; }
  if (window.rnpLocalLyricsBridge) return;

  const getStore = () => {
    const root = document.getElementById('root')?._reactRootContainer?._internalRoot?.current;
    const queue = root ? [root] : [];
    for (let i = 0; queue.length && i < 150; i++) {
      const fiber = queue.shift(), store = fiber.memoizedProps?.store;
      if (store?.getState && store?.subscribe) return store;
      if (fiber.child) queue.push(fiber.child);
      if (fiber.sibling) queue.push(fiber.sibling);
    }
    return null;
  };
  const localTrack = () => {
    const playing = getStore()?.getState()?.playing;
    const local = playing?.curPlaying?.localTrack;
    return playing?.trackFileType === 'local' && local?.filename && !local.encryptFile ? { playing, local } : null;
  };
  const cache = new Map();
  const readLocal = path => {
    if (cache.has(path)) return cache.get(path);
    const promise = (async () => {
      const sidecar = path.replace(/\.[^\\/.]+$/, '.lrc');
      if (await betterncm.fs.exists(sidecar)) {
        const bytes = new Uint8Array(await (await betterncm.fs.readFile(sidecar)).arrayBuffer());
        let value = bytes[0] === 255 && bytes[1] === 254 ? text(bytes, 'utf-16le') : bytes[0] === 254 && bytes[1] === 255 ? text(bytes, 'utf-16be') : text(bytes);
        if (value.includes('\uFFFD')) value = text(bytes, 'gb18030');
        if (value.trim()) return value;
      }
      if (!/\.(flac|mp3)$/i.test(path)) return '';
      const url = await betterncm.fs.mountFile(path);
      if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) throw Error('Expected BetterNCM localhost file URL');
      return readEmbedded(async (at, size) => {
        if (!size) return new Uint8Array();
        const response = await fetch(url, { headers: { Range: `bytes=${at}-${at + size - 1}` } });
        if (response.status !== 206) throw Error('Local metadata reader requires byte range support');
        return new Uint8Array(await response.arrayBuffer());
      });
    })();
    cache.set(path, promise);
    promise.catch(() => cache.delete(path));
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    return promise;
  };
  const rawLocal = value => ({ lrc: { lyric: value }, source: { name: 'Local' } });
  const fetchLyrics = async (id, options, fallback) => {
    const current = localTrack();
    if (!current) return fallback(id, options);
    const path = current.local.filename;
    let value = '';
    try { value = await readLocal(path); } catch (error) { console.warn('[RNP Local Lyrics]', error); }
    if (options.signal?.aborted || localTrack()?.local.filename !== path) return null;
    if (value) return rawLocal(value);
    const onlineId = String(current.playing.onlineResourceId ?? '');
    return /^\d+$/.test(onlineId) ? fallback(onlineId, options) : rawLocal('');
  };
  window.rnpLocalLyricsBridge = { version: '1.0.0', fetchLyrics, readLocal };
  let lastPath = '', generation = 0, store = null;
  const update = () => {
    const current = localTrack(), path = current?.local.filename ?? '';
    if (lastPath === path) return;
    lastPath = path;
    const token = ++generation;
    if (!path) return;
    // Clear the previous track while the local metadata is being read.
    window.onProcessLyrics?.(rawLocal(''), current.playing.resourceTrackId);
    readLocal(path).then(value => {
      if (token !== generation || localTrack()?.local.filename !== path || !value) return;
      window.onProcessLyrics?.(rawLocal(value), current.playing.resourceTrackId);
    }).catch(error => console.warn('[RNP Local Lyrics]', error));
  };
  const attach = () => {
    store = getStore();
    if (!store) return;
    store.subscribe(update);
    update();
  };
  attach();
  if (!store) {
    let attempts = 0;
    const timer = setInterval(() => { attach(); if (store || ++attempts >= 40) clearInterval(timer); }, 500);
  }
})();
