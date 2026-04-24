// Trigger lyrics-updated when lyrics change.
// Also expose window.currentLyrics for other modules.

import { parseLyric } from './liblyric/index.ts';
import { cyrb53 } from './utils.js';
import { appendRegisterCall, fetchLyricsBySongId, getPlayingSongId } from './ncm-compat.js';

const preProcessLyrics = (lyrics) => {
	if (!lyrics) return null;
	if (!lyrics.lrc) lyrics.lrc = {};

	const original = (lyrics?.lrc?.lyric ?? '').replace(/\u3000/g, ' ');
	const translation = lyrics?.ytlrc?.lyric ?? lyrics?.ttlrc?.lyric ?? lyrics?.tlyric?.lyric ?? '';
	const roma = lyrics?.yromalrc?.lyric ?? lyrics?.romalrc?.lyric ?? '';
	const dynamic = lyrics?.yrc?.lyric ?? '';
	const approxLines = original.match(/\[(.*?)\]/g)?.length ?? 0;

	const parsed = parseLyric(
		original,
		translation,
		roma,
		dynamic
	);

	if (approxLines - parsed.length > approxLines * 0.7) {
		return parseLyric(
			original,
			translation,
			roma
		);
	}

	return parsed;
};

const processLyrics = (lyrics) => {
	for (const line of lyrics ?? []) {
		if (line.originalLyric === '') {
			line.isInterlude = true;
		}
	}
	return lyrics ?? [];
};

const resolveSongId = (songID = '') => {
	return String(songID ?? '').trim() || getPlayingSongId() || '0';
};

const buildLyricFingerprint = (rawLyrics, songID) => {
	const resolvedSongId = resolveSongId(songID);
	if (typeof rawLyrics === 'string') {
		return `${resolvedSongId}::local::${rawLyrics}`;
	}

	return [
		resolvedSongId,
		rawLyrics?.lrc?.lyric ?? '',
		rawLyrics?.yrc?.lyric ?? '',
		rawLyrics?.tlyric?.lyric ?? '',
		rawLyrics?.ytlrc?.lyric ?? '',
		rawLyrics?.ttlrc?.lyric ?? '',
		rawLyrics?.romalrc?.lyric ?? '',
		rawLyrics?.yromalrc?.lyric ?? '',
		rawLyrics?.source?.name ?? '',
		rawLyrics?.data ?? '',
	].join('::');
};

const isObject = (value) => typeof value === 'object' && value !== null;
const LYRIC_ACTION_PATTERN = /lyric|karaoke|lrc|qrc|yrc/i;
const PRIORITY_KEYS = ['payload', 'data', 'lyric', 'lyrics', 'result', 'value', 'resource', 'meta'];

const isRawLyricsPayload = (value) => {
	return isObject(value) && (
		value?.data === -400 ||
		typeof value?.lrc?.lyric === 'string' ||
		typeof value?.yrc?.lyric === 'string' ||
		typeof value?.tlyric?.lyric === 'string' ||
		typeof value?.ytlrc?.lyric === 'string' ||
		typeof value?.ttlrc?.lyric === 'string' ||
		typeof value?.romalrc?.lyric === 'string' ||
		typeof value?.yromalrc?.lyric === 'string'
	);
};

const findRawLyricsPayload = (value, depth = 0, seen = new WeakSet()) => {
	if (!isObject(value) || depth > 4) {
		return null;
	}

	if (isRawLyricsPayload(value)) {
		return value;
	}

	if (seen.has(value)) {
		return null;
	}
	seen.add(value);

	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findRawLyricsPayload(item, depth + 1, seen);
			if (found) {
				return found;
			}
		}
		return null;
	}

	for (const key of PRIORITY_KEYS) {
		const found = findRawLyricsPayload(value[key], depth + 1, seen);
		if (found) {
			return found;
		}
	}

	if (depth >= 2) {
		return null;
	}

	for (const [key, nestedValue] of Object.entries(value)) {
		if (PRIORITY_KEYS.includes(key)) {
			continue;
		}
		if (depth === 1 && !LYRIC_ACTION_PATTERN.test(key)) {
			continue;
		}

		const found = findRawLyricsPayload(nestedValue, depth + 1, seen);
		if (found) {
			return found;
		}
	}

	return null;
};

let currentRawLyricFingerprint = null;
let currentLyricUpdateToken = Symbol('rnp-lyrics-update');
let lyricFetchAbortController = null;
let lastFetchedSongId = '';
let refreshTimer = 0;

const emitProcessedLyrics = async (_rawLyrics, songID = '') => {
	if (!_rawLyrics || _rawLyrics?.data === -400) {
		return false;
	}

	let rawLyrics = _rawLyrics;
	if (typeof _rawLyrics === 'string') {
		rawLyrics = {
			lrc: {
				lyric: _rawLyrics,
			},
			source: {
				name: 'Local',
			},
		};
	}

	const resolvedSongId = resolveSongId(songID);
	const lyricFingerprint = buildLyricFingerprint(rawLyrics, resolvedSongId);
	if (lyricFingerprint === currentRawLyricFingerprint) {
		return false;
	}

	currentRawLyricFingerprint = lyricFingerprint;
	lastFetchedSongId = resolvedSongId;
	const updateToken = Symbol('rnp-lyrics-update');
	currentLyricUpdateToken = updateToken;

	const preprocessedLyrics = preProcessLyrics(rawLyrics);
	setTimeout(async () => {
		if (currentLyricUpdateToken !== updateToken) {
			return;
		}

		const processedLyrics = await processLyrics(preprocessedLyrics ?? []);
		if (currentLyricUpdateToken !== updateToken) {
			return;
		}

		const lyrics = {
			lyrics: processedLyrics,
			contributors: {},
		};

		if (processedLyrics[0]?.unsynced) {
			lyrics.unsynced = true;
		}

		if (rawLyrics?.lyricUser) {
			lyrics.contributors.original = {
				name: rawLyrics.lyricUser.nickname,
				userid: rawLyrics.lyricUser.userid,
			};
		}
		if (rawLyrics?.transUser) {
			lyrics.contributors.translation = {
				name: rawLyrics.transUser.nickname,
				userid: rawLyrics.transUser.userid,
			};
		}

		lyrics.contributors.roles = (rawLyrics?.roles ?? []).filter((role) => {
			return !(role.artistMetaList?.length === 1 && role.artistMetaList[0]?.artistId === 0);
		});

		for (let i = 0; i < lyrics.contributors.roles.length; i += 1) {
			const metaList = JSON.stringify(lyrics.contributors.roles[i].artistMetaList);
			for (let j = i + 1; j < lyrics.contributors.roles.length; j += 1) {
				if (JSON.stringify(lyrics.contributors.roles[j].artistMetaList) === metaList) {
					lyrics.contributors.roles[i].roleName += ` / ${lyrics.contributors.roles[j].roleName}`;
					lyrics.contributors.roles.splice(j, 1);
					j -= 1;
				}
			}
		}

		if (rawLyrics?.source) {
			lyrics.contributors.lyricSource = rawLyrics.source;
		}

		lyrics.hash = `${resolvedSongId}-${cyrb53(processedLyrics.map((line) => line.originalLyric).join('\\'))}`;
		window.currentLyrics = lyrics;
		console.group('Update Processed Lyrics');
		console.log('lyrics', window.currentLyrics.lyrics);
		console.log('contributors', window.currentLyrics.contributors);
		console.log('hash', window.currentLyrics.hash);
		console.groupEnd();
		document.dispatchEvent(new CustomEvent('lyrics-updated', { detail: window.currentLyrics }));
	}, 0);

	return true;
};

const originalOnProcessLyrics = window.onProcessLyrics ?? ((value) => value);
window.onProcessLyrics = (_rawLyrics, songID) => {
	emitProcessedLyrics(_rawLyrics, songID);
	return originalOnProcessLyrics(_rawLyrics, songID);
};

window.rnpDispatchHook = (action) => {
	if (!action || typeof action !== 'object') {
		return action;
	}

	const actionType = `${action?.type ?? ''}${action?.name ?? ''}`;
	if (!isRawLyricsPayload(action) && !LYRIC_ACTION_PATTERN.test(actionType)) {
		return action;
	}

	const rawLyrics = findRawLyricsPayload(action);
	if (rawLyrics) {
		emitProcessedLyrics(rawLyrics, resolveSongId());
	}

	return action;
};

const refreshLyricsFromCurrentSong = async (songID = getPlayingSongId(), { force = false } = {}) => {
	const resolvedSongId = resolveSongId(songID);
	if (!resolvedSongId || resolvedSongId === '0') {
		return;
	}
	if (!force && lastFetchedSongId === resolvedSongId) {
		return;
	}

	lyricFetchAbortController?.abort();
	const abortController = new AbortController();
	lyricFetchAbortController = abortController;

	try {
		const rawLyrics = await fetchLyricsBySongId(resolvedSongId, { signal: abortController.signal });
		if (abortController.signal.aborted || !rawLyrics) {
			return;
		}

		emitProcessedLyrics(rawLyrics, resolvedSongId);
	} catch (error) {
		if (!abortController.signal.aborted) {
			console.debug(`Failed to fetch lyrics for ${resolvedSongId}`, error);
		}
	}
};

const scheduleLyricsRefresh = (delay = 120, force = false) => {
	clearTimeout(refreshTimer);
	refreshTimer = window.setTimeout(() => {
		refreshLyricsFromCurrentSong(getPlayingSongId(), { force });
	}, delay);
};

appendRegisterCall('Load', 'audioplayer', () => {
	scheduleLyricsRefresh();
});

setTimeout(() => {
	scheduleLyricsRefresh(0, true);
}, 0);
