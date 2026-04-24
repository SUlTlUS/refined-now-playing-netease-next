import './styles.scss';
import './exclusive-modes.scss';
import './experimental.scss';
import settingsMenuHTML from './settings-menu.html';
import './settings-menu.scss';
import { argb2Rgb, rgb2Argb } from './color-utils.js';
import { getSetting, setSetting, chunk, copyTextToClipboard } from './utils.js';
import { Background } from './background.js';
import { CoverShadow } from './cover-shadow.js';
import { Lyrics } from './lyrics.js';
import { themeFromSourceColor, QuantizerCelebi, Hct, Score } from "@importantimport/material-color-utilities";
import { compatibilityWizard, hijackFailureNoticeCheck } from './compatibility-check.js';
import { whatsNew } from './whats-new.js';
import { showContextMenu } from './context-menu.js';
import { MiniSongInfo } from './mini-song-info.js';
import { FontSettings } from './font-settings.js';
import { appendRegisterCall, getNCMStore, getPlayingSong, getPlayingSongId } from './ncm-compat.js';
import { createRoot } from 'react-dom/client';
import { V3PlayerControls } from './v3-player-controls.js';

const updateAccentColor = (name, argb) => {
	const [r, g, b] = [...argb2Rgb(argb)];
	document.body.style.setProperty(`--${name}`, `rgb(${r}, ${g}, ${b})`);
	document.body.style.setProperty(`--${name}-rgb`, `${r}, ${g}, ${b}`);
}

const useGreyAccentColor = () => {
	updateAccentColor('rnp-accent-color-dark', rgb2Argb(150, 150, 150));
	updateAccentColor('rnp-accent-color-on-primary-dark', rgb2Argb(10, 10, 10));
	updateAccentColor('rnp-accent-color-shade-1-dark', rgb2Argb(210, 210, 210));
	updateAccentColor('rnp-accent-color-shade-2-dark', rgb2Argb(255, 255, 255));
	updateAccentColor('rnp-accent-color-bg-dark', rgb2Argb(50, 50, 50));

	
	updateAccentColor('rnp-accent-color-light', rgb2Argb(120, 120, 120));
	updateAccentColor('rnp-accent-color-on-primary-light', rgb2Argb(250, 250, 250));
	updateAccentColor('rnp-accent-color-shade-1-light', rgb2Argb(40, 40, 40));
	updateAccentColor('rnp-accent-color-shade-2-light', rgb2Argb(20, 20, 20));
	updateAccentColor('rnp-accent-color-bg-light', rgb2Argb(190, 190, 190));
}

let lastDom = null;
const calcAccentColor = (dom) => {
	lastDom = dom.cloneNode(true);

	const canvas = document.createElement('canvas');
	canvas.width = 50;
	canvas.height = 50;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(dom, 0, 0, dom.naturalWidth, dom.naturalHeight, 0, 0, 50, 50);
	const pixels = chunk(ctx.getImageData(0, 0, 50, 50).data, 4).map((pixel) => {
		return ((pixel[3] << 24 >>> 0) | (pixel[0] << 16 >>> 0) | (pixel[1] << 8 >>> 0) | pixel[2]) >>> 0;
	});
	const quantizedColors = QuantizerCelebi.quantize(pixels, 128);
	const sortedQuantizedColors = Array.from(quantizedColors).sort((a, b) => b[1] - a[1]);

	const mostFrequentColors = sortedQuantizedColors.slice(0, 5).map((x) => argb2Rgb(x[0]));
	if (mostFrequentColors.every((x) => Math.max(...x) - Math.min(...x) < 5)) {
		useGreyAccentColor();
		return;
	}

	const ranked = Score.score(new Map(sortedQuantizedColors.slice(0, 50)));
	const top = ranked[0];
	const theme = themeFromSourceColor(top);

	const variant = window.accentColorVariant ?? 'primary';

	// theme.schemes.light.bgDarken = (Hct.from(theme.palettes.neutral.hue, theme.palettes.neutral.chroma, 97.5)).toInt();
	updateAccentColor('rnp-accent-color-dark', theme.schemes.dark[variant]);
	updateAccentColor('rnp-accent-color-on-primary-dark', (Hct.from(theme.palettes[variant].hue, theme.palettes[variant].chroma, 20)).toInt());
	updateAccentColor('rnp-accent-color-shade-1-dark', (Hct.from(theme.palettes[variant].hue, theme.palettes[variant].chroma, 80)).toInt());
	updateAccentColor('rnp-accent-color-shade-2-dark', (Hct.from(theme.palettes[variant].hue, theme.palettes[variant].chroma, 90)).toInt());
	updateAccentColor('rnp-accent-color-bg-dark', (Hct.from(theme.palettes.secondary.hue, theme.palettes.secondary.chroma, 20)).toInt());

	updateAccentColor('rnp-accent-color-light', theme.schemes.light.onPrimaryContainer);
	updateAccentColor('rnp-accent-color-on-primary-light', (Hct.from(theme.palettes[variant].hue, theme.palettes[variant].chroma, 100)).toInt());
	updateAccentColor('rnp-accent-color-shade-1-light', (Hct.from(theme.palettes[variant].hue, theme.palettes[variant].chroma, 25)).toInt());
	updateAccentColor('rnp-accent-color-shade-2-light', (Hct.from(theme.palettes[variant].hue, theme.palettes[variant].chroma, 15)).toInt());
	updateAccentColor('rnp-accent-color-bg-light', (Hct.from(theme.palettes.secondary.hue, theme.palettes.secondary.chroma, 90)).toInt());
}
const recalcAccentColor = () => {
	if (lastDom) {
		calcAccentColor(lastDom);
	}
}

let lastCDImage = '';
const updateCDImage = () => {
	if (!document.querySelector('.g-single')) {
		return;
	}
	
	const imgDom = document.querySelector('.n-single .cdimg img');
	if (!imgDom) {
		return;
	}

	const realCD = document.querySelector('.n-single .cdimg');

	const update = () => {
		const cdImage = imgDom.src;
		if (cdImage === lastCDImage) {
			return;
		}
		lastCDImage = cdImage;
		calcAccentColor(imgDom);
	}

	if (imgDom.complete) {
		update();
		realCD.classList.remove('loading');
	} else {
		realCD.classList.add('loading');
	}
}
	


let lastTitle = "";
const titleSizeController = document.createElement('style');
titleSizeController.innerHTML = '';
document.head.appendChild(titleSizeController);
const TITLE_MAX_FONT_SIZE = 52;
const TITLE_MIN_FONT_SIZE = 22;
const recalculateTitleSize = (forceRefresh = false) => {
	const title = document.querySelector(`#${RNP_VIEW_ID} .g-singlec-ct .n-single .mn .head .inf .title`)
		?? document.querySelector('.g-single .g-singlec-ct .n-single .mn .head .inf .title');
	if (!title) {
		return;
	}
	if (title.innerText === lastTitle && !forceRefresh) {
		return;
	}
	lastTitle = title.innerText;
	const titleContainer = title.querySelector('.name');
	const text = title.querySelector('.name-inner')?.textContent ?? titleContainer?.textContent ?? title.innerText;
	if (!titleContainer || !text.trim()) {
		return;
	}
	const testDiv = document.createElement('div');
	testDiv.style.position = 'absolute';
	testDiv.style.top = '-9999px';
	testDiv.style.left = '-9999px';
	testDiv.style.width = 'auto';
	testDiv.style.height = 'auto';
	testDiv.style.whiteSpace = 'nowrap';
	testDiv.style.fontWeight = '700';
	testDiv.innerText = text;
	document.body.appendChild(testDiv);

	const maxThreshold = Math.max(Math.min(document.body.clientHeight * 0.045, TITLE_MAX_FONT_SIZE), 34);
	const minThreshold = TITLE_MIN_FONT_SIZE;
	const targetWidth = titleContainer.clientWidth || title.clientWidth;

	if (targetWidth == 0) {
		document.body.removeChild(testDiv);
		return;
	}

	let l = minThreshold;
	let r = Math.ceil(maxThreshold) + 1;
	while (l < r) {
		const mid = Math.floor((l + r) / 2);
		testDiv.style.fontSize = `${mid}px`;
		const width = testDiv.clientWidth;
		if (width <= targetWidth) {
			l = mid + 1;
		} else {
			r = mid;
		}
	}
	const fontSize = Math.max(Math.min(l - 1, maxThreshold), minThreshold);
	document.body.removeChild(testDiv);
	titleSizeController.innerHTML = `
		#${RNP_VIEW_ID} .g-singlec-ct .n-single .mn .head .inf .title h1 {
			font-size: ${fontSize}px !important;
		}
	`;
	requestAnimationFrame(calcTitleScroll);
}
const verticalAlignMiddleController = document.createElement('style');
verticalAlignMiddleController.innerHTML = '';
document.head.appendChild(verticalAlignMiddleController);

window.addEventListener('resize', () => {
	recalculateTitleSize(true);
	applyV3LyricPageAlignment();
});
window.addEventListener('recalc-lyrics', applyV3LyricPageAlignment);

const moveTags = () => {
	const titleBase = document.querySelector(".g-single-track .g-singlec-ct .n-single .mn .head .inf .title");
	if (!titleBase) {
		return;
	}
	const tags = titleBase.querySelector("h1 > .name > .tag-wrap");
	if (!tags) {
		return;
	}
	const existingTags = titleBase.querySelector("h1 > .tag-wrap");
	if (existingTags) {
		existingTags.remove();
	}
	titleBase.querySelector("h1").appendChild(tags);
}
const ensureTitleScrollStructure = (titleContainer) => {
	if ((titleContainer?.firstChild?.nodeType ?? 0) === 3) {
		const titleInner = document.createElement('span');
		titleInner.classList.add('name-inner');
		titleInner.textContent = titleContainer.textContent?.replace(/\u00a0/g, ' ') ?? '';
		titleContainer.textContent = '';
		titleContainer.appendChild(titleInner);
	}

	let titleTrack = titleContainer.querySelector('.name-marquee-track');
	let titleInner = titleContainer.querySelector('.name-inner');
	if (!titleInner) {
		titleInner = document.createElement('span');
		titleInner.classList.add('name-inner');
		titleContainer.appendChild(titleInner);
	}
	if (!titleTrack) {
		titleTrack = document.createElement('span');
		titleTrack.classList.add('name-marquee-track');
		titleContainer.insertBefore(titleTrack, titleInner);
		titleTrack.appendChild(titleInner);
	}

	let titleDuplicate = titleTrack.querySelector('.name-duplicate');
	if (!titleDuplicate) {
		titleDuplicate = document.createElement('span');
		titleDuplicate.classList.add('name-duplicate');
		titleDuplicate.setAttribute('aria-hidden', 'true');
		titleTrack.appendChild(titleDuplicate);
	}

	return {
		titleTrack,
		titleInner,
		titleDuplicate,
	};
};
const measureTitleTextWidth = (referenceElement, text) => {
	const resolvedText = String(text ?? '').replace(/\u00a0/g, ' ').trim();
	if (!referenceElement || !resolvedText) {
		return 0;
	}

	const computedStyle = window.getComputedStyle(referenceElement);
	const measureSpan = document.createElement('span');
	measureSpan.textContent = resolvedText;
	measureSpan.style.position = 'absolute';
	measureSpan.style.left = '-99999px';
	measureSpan.style.top = '-99999px';
	measureSpan.style.visibility = 'hidden';
	measureSpan.style.pointerEvents = 'none';
	measureSpan.style.whiteSpace = 'nowrap';
	measureSpan.style.font = computedStyle.font;
	measureSpan.style.fontSize = computedStyle.fontSize;
	measureSpan.style.fontWeight = computedStyle.fontWeight;
	measureSpan.style.fontFamily = computedStyle.fontFamily;
	measureSpan.style.letterSpacing = computedStyle.letterSpacing;
	measureSpan.style.textTransform = computedStyle.textTransform;
	measureSpan.style.textIndent = computedStyle.textIndent;
	document.body.appendChild(measureSpan);
	const measuredWidth = measureSpan.getBoundingClientRect().width;
	document.body.removeChild(measureSpan);
	return measuredWidth;
};
const calcTitleScroll = () => {
	moveTags();
	const titleContainer = document.querySelector(`#${RNP_VIEW_ID} .g-singlec-ct .n-single .mn .head .inf .title .name`)
		?? document.querySelector('.g-single .g-singlec-ct .n-single .mn .head .inf .title .name');
	if (!titleContainer) {
		return;
	}
	const { titleTrack, titleInner, titleDuplicate } = ensureTitleScrollStructure(titleContainer);
	const containerWidth = titleContainer.clientWidth;
	const titleText = titleInner.textContent ?? '';
	const innerWidth = measureTitleTextWidth(titleInner, titleText);
	const gap = Math.max(12, Math.min(Math.round(containerWidth * 0.045), 20));
	const shouldScroll = containerWidth > 0 && (innerWidth - containerWidth) > 1;
	titleDuplicate.textContent = shouldScroll ? titleText : '';
	titleContainer.style.setProperty('--scroll-gap', `${gap}px`);
	if (shouldScroll) {
		titleTrack.style.transform = '';
		titleContainer.classList.add('scroll');
	} else {
		titleContainer.classList.remove('scroll');
		titleTrack.style.transform = 'translateX(0)';
	}
	titleContainer.style.setProperty('--scroll-distance', `${Math.max(innerWidth + gap, 0)}px`);
	titleContainer.style.setProperty('--scroll-speed', `${Math.max((innerWidth + gap) / 30, 6)}s`);
}

const RNP_VIEW_ID = 'rnp-view';
const RNP_PAGE_OPEN_CLASS = 'rnp-lyric-page-open';
const RNP_WINDOW_TOOLS_VISIBLE_CLASS = 'rnp-window-tools-visible';
const RNP_CONTROL_THUMB_VISIBLE_CLASS = 'rnp-control-thumb-visible';
const NATIVE_LYRIC_PAGE_BUTTON_SELECTOR = '.miniVinylWrapper';
const NATIVE_BOTTOM_BAR_SELECTOR = 'footer';
const NATIVE_WINDOW_CONTROL_SELECTOR = '.m-winctrl';
const NATIVE_BOTTOM_BAR_CONTROL_SELECTOR = [
	'button',
	'a',
	'input',
	'select',
	'textarea',
	'[role="button"]',
	'[role="link"]',
	'[role="slider"]',
	'[aria-disabled]',
	'[data-action]',
	'[tabindex]',
	'.f-cp',
	'.appkit-now-playing-slider',
	'.am-music-controls',
	'.am-music-progress-control',
	'a[class*="btn"]',
	'a[class*="link"]',
	'a[class*="play"]',
	'a[class*="pause"]',
	'a[class*="prev"]',
	'a[class*="next"]',
	'a[class*="volume"]',
	'[class*="slider"]',
	'[class*="volume"]',
	'[class*="progress"]',
].join(',');
const NATIVE_BOTTOM_BAR_META_HOST_SELECTOR = [
	'.left',
	'[class*="left"]',
	'[class*="meta"]',
	'[class*="info"]',
	'[class*="song"]',
	'[class*="title"]',
].join(',');
const NATIVE_BOTTOM_BAR_META_TEXT_AREA_SELECTOR = [
	'.left [class*="info"]',
	'.left [class*="meta"]',
	'.left [class*="song"]',
	'.left [class*="title"]',
	'.left [class*="text"]',
	'.left [class*="desc"]',
	'[class*="songInfo"]',
	'[class*="song-info"]',
	'[class*="track-info"]',
	'[class*="music-info"]',
].join(',');
const NATIVE_BOTTOM_BAR_META_TEXT_EXCLUDE_PATTERN = /play|pause|prev|previous|next|volume|playlist|queue|mode|setting|fullscreen|cover|\u64ad\u653e|\u6682\u505c|\u4e0a\u4e00|\u4e0b\u4e00|\u97f3\u91cf|\u64ad\u653e\u5217\u8868|\u64ad\u653e\u6a21\u5f0f|\u8bbe\u7f6e|\u5168\u5c4f|\u5c01\u9762/;
const NATIVE_MENU_LAYER_SELECTOR = [
	'[role="menu"]',
	'[role="listbox"]',
	'.m-layer',
	'.u-arrlay',
	'[class*="menu"]',
	'[class*="popover"]',
	'[class*="dropdown"]',
	'[class*="context"]',
].join(',');
const NATIVE_MENU_ITEM_SELECTOR = [
	'button',
	'a',
	'li',
	'[role="menuitem"]',
	'[role="option"]',
	'[class*="item"]',
	'[class*="option"]',
	'[tabindex]',
].join(',');
const NATIVE_MENU_SPEED_PATTERN = /(?:^|[\s(])(?:0\.5|0\.75|1(?:\.0)?|1\.25|1\.5|2(?:\.0)?)x(?:$|[\s)])/;
const NATIVE_MENU_CLOSE_DESCRIPTOR_PATTERN = /artist|album|歌手|专辑|speed|rate|倍速|速度|播放速度|播放倍速/;
const WINDOW_CONTROL_LABEL_PATTERNS = {
	minimize: /min|small|hide|minimize|\u6700\u5c0f/,
	maximize: /max|restore|zoom|expand|maximize|\u6700\u5927|\u8fd8\u539f|\u7f29\u653e/,
	close: /close|exit|quit|shutdown|\u5173\u95ed/,
};
const INTERACTIVE_WINDOW_CONTROL_SELECTOR = [
	'button',
	'[role="button"]',
	'a',
	'.btn',
	'[class*="btn"]',
	'[class*="button"]',
	'[class*="close"]',
	'[class*="min"]',
	'[class*="max"]',
	'[class*="zoom"]',
].join(',');
const EMPTY_IMAGE_URL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const DEFAULT_COVER_IMAGE_URL = 'orpheus://cache/?https://p1.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg';

const normalizeText = (value) => String(value ?? '').trim();
const resolveAlbumImageSize = (value = window.albumSize) => {
	const size = Number(value || 210);
	if (!Number.isFinite(size) || size <= 0) {
		return 210;
	}
	return size === 200 ? 210 : Math.round(size);
};
const applyAlbumImageSize = (src, size = window.albumSize) => {
	const resolvedSize = resolveAlbumImageSize(size);
	let coverUrl = normalizeText(src);
	if (!coverUrl || coverUrl.startsWith('data:image/gif;')) {
		coverUrl = DEFAULT_COVER_IMAGE_URL;
	}

	if (/thumbnail=\d+y\d+/i.test(coverUrl)) {
		return coverUrl.replace(/thumbnail=\d+y\d+/ig, `thumbnail=${resolvedSize}y${resolvedSize}`);
	}
	if (/(^|[?&])param=\d+y\d+/i.test(coverUrl)) {
		return coverUrl.replace(/([?&])param=\d+y\d+/ig, `$1param=${resolvedSize}y${resolvedSize}`);
	}
	if (/music\.126\.net/i.test(coverUrl)) {
		return `${coverUrl}${coverUrl.includes('?') ? '&' : '?'}param=${resolvedSize}y${resolvedSize}`;
	}

	return coverUrl;
};

const getPlayingArtists = (playingSong) => {
	const artistCandidates = [
		playingSong?.resourceArtists,
		playingSong?.artists,
		playingSong?.curTrack?.artists,
		playingSong?.curTrack?.ar,
		playingSong?.data?.artists,
	];

	for (const candidates of artistCandidates) {
		if (!Array.isArray(candidates)) {
			continue;
		}

		const artists = candidates
			.map((artist) => ({
				id: normalizeText(artist?.id),
				name: normalizeText(artist?.name),
			}))
			.filter((artist) => artist.name);
		if (artists.length > 0) {
			return artists;
		}
	}

	return [];
};

const getPlayingAlias = (playingSong) => {
	const aliasCandidates = [
		playingSong?.curTrack?.alia,
		playingSong?.curTrack?.alias,
		playingSong?.curTrack?.transNames,
		playingSong?.originFromTrack?.alias,
		playingSong?.data?.alias,
	];

	for (const candidate of aliasCandidates) {
		if (Array.isArray(candidate)) {
			const alias = candidate.map((value) => normalizeText(value)).filter(Boolean).join(' / ');
			if (alias) {
				return alias;
			}
			continue;
		}

		const alias = normalizeText(candidate);
		if (alias) {
			return alias;
		}
	}

	return '';
};

const getPlayingAlbumInfo = (playingSong) => {
	const albumCandidates = [
		{
			id: playingSong?.curTrack?.album?.id,
			name: playingSong?.curTrack?.album?.name,
		},
		{
			id: playingSong?.curTrack?.al?.id,
			name: playingSong?.curTrack?.al?.name,
		},
		{
			id: playingSong?.data?.album?.id,
			name: playingSong?.data?.album?.name,
		},
	];

	for (const album of albumCandidates) {
		const albumName = normalizeText(album?.name);
		if (albumName) {
			return {
				id: normalizeText(album?.id),
				name: albumName,
			};
		}
	}

	return {
		id: '',
		name: '',
	};
};

const getPlayingCoverUrl = (playingSong) => {
	const coverCandidates = [
		playingSong?.resourceCoverUrl,
		playingSong?.curTrack?.album?.picUrl,
		playingSong?.curTrack?.al?.picUrl,
		playingSong?.curTrack?.coverUrl,
		playingSong?.data?.album?.picUrl,
	];

	for (const candidate of coverCandidates) {
		const coverUrl = normalizeText(candidate);
		if (coverUrl) {
			return applyAlbumImageSize(coverUrl);
		}
	}

	return applyAlbumImageSize(EMPTY_IMAGE_URL);
};

const getCurrentPlayingInfo = () => {
	const playingSong = getPlayingSong() ?? {};
	const artists = getPlayingArtists(playingSong);
	const album = getPlayingAlbumInfo(playingSong);
	const songId = getPlayingSongId();
	const title = normalizeText(
		playingSong?.resourceName
		?? playingSong?.name
		?? playingSong?.curTrack?.name
		?? playingSong?.data?.name
	) || 'Unknown Song';

	return {
		songId,
		title,
		artists,
		artistText: artists.map((artist) => artist.name).join(' / ') || 'Unknown Artist',
		alias: getPlayingAlias(playingSong),
		album,
		coverUrl: getPlayingCoverUrl(playingSong),
	};
};

const clearElementChildren = (element) => {
	if (element) element.textContent = '';
};

const NATIVE_NAVIGABLE_SELECTOR = [
	'a',
	'button',
	'[role="button"]',
	'[role="menuitem"]',
	'[data-action]',
	'[onclick]',
	'.f-cp',
	'[tabindex]',
].join(',');
const NATIVE_MORE_BUTTON_PATTERN = /more|\u66f4\u591a|menu|\u8be6\u60c5|\u5c55\u5f00/;
const NATIVE_ARTIST_TARGET_EXCLUDE_PATTERN = /play|pause|prev|previous|next|volume|playlist|queue|mode|close|setting|fullscreen|\u64ad\u653e|\u6682\u505c|\u4e0a\u4e00|\u4e0b\u4e00|\u97f3\u91cf|\u64ad\u653e\u5217\u8868|\u64ad\u653e\u6a21\u5f0f|\u5173\u95ed|\u8bbe\u7f6e|\u5168\u5c4f|\u66f4\u591a/;
const NATIVE_MORE_BUTTON_EXCLUDE_PATTERN = /play|pause|prev|previous|next|volume|playlist|queue|mode|favorite|like|\u64ad\u653e|\u6682\u505c|\u4e0a\u4e00|\u4e0b\u4e00|\u97f3\u91cf|\u64ad\u653e\u5217\u8868|\u64ad\u653e\u6a21\u5f0f|\u7ea2\u5fc3|\u6536\u85cf/;
const NATIVE_ALBUM_TARGET_PATTERN = /album|\u4e13\u8f91/;

const normalizeComparableText = (value) => normalizeText(value).toLowerCase().replace(/\s+/g, '');

const ROOT_ROUTER_CANDIDATES = [
	() => getNCMStore()?.router,
	() => getNCMStore()?.history,
	() => getNCMStore()?.getState?.()?.router,
	() => getNCMStore()?.getState?.()?.history,
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.child?.child?.memoizedProps,
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.child?.memoizedProps,
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.memoizedProps,
];

const normalizeRoutePath = (href) => {
	const normalizedHref = normalizeText(href);
	if (!normalizedHref || normalizedHref.startsWith('javascript:')) {
		return '';
	}

	const nextHash = normalizedHref.startsWith('#') ? normalizedHref : `#${normalizedHref}`;
	const nextPath = nextHash.replace(/^#/, '');
	return nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
};

const getRouteNavigator = () => {
	const visited = new Set();
	const candidates = [];

	for (const getCandidate of ROOT_ROUTER_CANDIDATES) {
		try {
			const candidate = getCandidate();
			if (candidate) {
				candidates.push(candidate);
			}
		} catch (error) {
			console.debug('Failed to resolve router candidate', error);
		}
	}

	while (candidates.length > 0) {
		const candidate = candidates.shift();
		if (!candidate || visited.has(candidate)) {
			continue;
		}
		visited.add(candidate);

		if (typeof candidate.navigate === 'function') {
			return (path) => candidate.navigate(path);
		}
		if (typeof candidate.push === 'function') {
			return (path) => candidate.push(path);
		}
		if (typeof candidate.replace === 'function' && typeof candidate.location === 'object') {
			return (path) => candidate.replace(path);
		}

		['router', 'history', 'navigator', 'props'].forEach((key) => {
			const nested = candidate?.[key];
			if (nested && typeof nested === 'object') {
				candidates.push(nested);
			}
		});
	}

	return null;
};

const dispatchRouteFallbackEvents = (oldURL, newURL) => {
	try {
		if (typeof HashChangeEvent === 'function') {
			window.dispatchEvent(new HashChangeEvent('hashchange', {
				oldURL,
				newURL,
			}));
		} else {
			window.dispatchEvent(new Event('hashchange'));
		}
	} catch (error) {
		window.dispatchEvent(new Event('hashchange'));
	}

	try {
		if (typeof PopStateEvent === 'function') {
			window.dispatchEvent(new PopStateEvent('popstate', {
				state: window.history?.state,
			}));
		} else {
			window.dispatchEvent(new Event('popstate'));
		}
	} catch (error) {
		window.dispatchEvent(new Event('popstate'));
	}
};

const fallbackNavigateWithinApp = (normalizedHref) => {
	const nextHash = normalizedHref.startsWith('#') ? normalizedHref : `#${normalizedHref}`;
	const oldURL = window.location.href;
	const newURL = new URL(window.location.href);
	newURL.hash = nextHash;

	try {
		if (window.history?.pushState) {
			window.history.pushState(window.history.state, '', nextHash);
		} else {
			window.location.hash = nextHash;
		}
	} catch (error) {
		window.location.hash = nextHash;
	}

	if (window.location.hash !== nextHash) {
		window.location.hash = nextHash;
	}
	dispatchRouteFallbackEvents(oldURL, newURL.toString());
};

const navigateWithinApp = (href) => {
	const normalizedHref = normalizeText(href);
	if (!normalizedHref || normalizedHref.startsWith('javascript:')) {
		return false;
	}

	closeRnpLyricPage();
	const nextPath = normalizeRoutePath(normalizedHref);
	window.setTimeout(() => {
		const routeNavigator = getRouteNavigator();
		if (routeNavigator && nextPath) {
			try {
				routeNavigator(nextPath);
				window.setTimeout(() => {
					const currentRoute = normalizeComparableText(`${window.location.pathname}${window.location.search}${window.location.hash}`);
					const targetRoute = normalizeComparableText(nextPath);
					if (!currentRoute.includes(targetRoute)) {
						fallbackNavigateWithinApp(normalizedHref);
					}
				}, 48);
				return;
			} catch (error) {
				console.warn('Failed to navigate with app router, falling back to hash navigation', error);
			}
		}
		fallbackNavigateWithinApp(normalizedHref);
	}, 0);
	return true;
};

const appendLineText = (container, label, className = '') => {
	const text = document.createElement('span');
	text.textContent = label;
	if (className) {
		text.className = className;
	}
	container.appendChild(text);
	return text;
};

const getVisibleNativeBottomBar = () => (
	Array.from(document.querySelectorAll(NATIVE_BOTTOM_BAR_SELECTOR)).find((element) => (
		!element.closest(`#${RNP_VIEW_ID}`) && isVisibleElement(element)
	)) ?? null
);

const getVisibleNativeMenuLayers = () => (
	sortElementsByPosition(
		Array.from(document.querySelectorAll(NATIVE_MENU_LAYER_SELECTOR)).filter((element) => (
			!element.closest(`#${RNP_VIEW_ID}`)
			&& isVisibleElement(element)
			&& normalizeText(element.textContent)
		))
	)
);

const getActiveNativeMenuLayer = () => {
	const layers = getVisibleNativeMenuLayers();
	return layers[layers.length - 1] ?? null;
};

const getNavigableAncestor = (element, boundary = document.body) => {
	for (let node = element; node && node !== boundary; node = node.parentElement) {
		if (node.matches?.(NATIVE_NAVIGABLE_SELECTOR)) {
			return node;
		}
	}
	if (boundary?.matches?.(NATIVE_NAVIGABLE_SELECTOR)) {
		return boundary;
	}
	return null;
};

const closeRnpLyricPageSoon = () => {
	window.setTimeout(() => {
		closeRnpLyricPage();
	}, 0);
	return true;
};

const disarmCloseAfterNativeMenu = () => {
	pendingCloseAfterNativeMenu = false;
	clearTimeout(pendingCloseAfterNativeMenuTimer);
};

const armCloseAfterNativeMenu = () => {
	pendingCloseAfterNativeMenu = true;
	clearTimeout(pendingCloseAfterNativeMenuTimer);
	pendingCloseAfterNativeMenuTimer = window.setTimeout(() => {
		disarmCloseAfterNativeMenu();
	}, 8000);
};

const clickNativeNavigationTarget = (target) => {
	if (!target || !isVisibleElement(target)) {
		return false;
	}
	return clickDomElement(target, getElementCenterPoint(target));
};

const findNativeArtistTarget = (artist) => {
	const footer = getVisibleNativeBottomBar();
	const artistName = normalizeComparableText(artist?.name);
	const artistId = normalizeComparableText(artist?.id);
	if (!footer || !artistName) {
		return null;
	}

	const footerMetaHost = footer.querySelector('.left, [class*="left"]') ?? footer;
	const scoredTargets = new Map();
	const elementCandidates = sortElementsByPosition(
		Array.from(footerMetaHost.querySelectorAll('a, button, [role="button"], span, div'))
			.filter((element) => isVisibleElement(element))
	);

	for (const element of elementCandidates) {
		const text = normalizeComparableText(element.textContent);
		if (!text || !text.includes(artistName)) {
			continue;
		}

		const target = getNavigableAncestor(element, footerMetaHost) ?? (element.matches?.(NATIVE_NAVIGABLE_SELECTOR) ? element : null);
		if (!target || scoredTargets.has(target) || !isVisibleElement(target)) {
			continue;
		}

		const descriptor = getElementDescriptor(target);
		const targetText = normalizeComparableText(target.textContent);
		const elementText = normalizeComparableText(element.textContent);
		let score = 0;
		if (artistId && descriptor.includes(artistId)) {
			score += 8;
		}
		if (/artist|\u6b4c\u624b/.test(descriptor)) {
			score += 6;
		}
		if (elementText === artistName) {
			score += 12;
		} else if (elementText.startsWith(artistName) || elementText.endsWith(artistName)) {
			score += 8;
		}
		if (targetText === artistName) {
			score += 10;
		} else if (targetText.includes(artistName)) {
			score += 4;
		}
		if (/[/,&]| feat\.| ft\.|、|，|,/.test(targetText)) {
			score -= 6;
		}
		if (target.tagName === 'A') {
			score += 2;
		}
		if (NATIVE_ARTIST_TARGET_EXCLUDE_PATTERN.test(descriptor)) {
			score -= 10;
		}
		if (score > 0) {
			scoredTargets.set(target, score);
		}
	}

	return [...scoredTargets.entries()]
		.sort((first, second) => second[1] - first[1])
		.map(([target]) => target)[0] ?? null;
};

const findNativeMoreButton = () => {
	const footer = getVisibleNativeBottomBar();
	if (!footer) {
		return null;
	}

	const buttonCandidates = sortElementsByPosition(
		Array.from(footer.querySelectorAll('button, a, [role="button"]'))
			.filter((element) => !element.closest(`#${RNP_VIEW_ID}`) && isVisibleElement(element))
	);
	const scoredButtons = buttonCandidates.map((button) => {
		const descriptor = getElementDescriptor(button);
		const rect = button.getBoundingClientRect?.() ?? { left: 0 };
		let score = rect.left / Math.max(window.innerWidth || 1, 1);
		if (NATIVE_MORE_BUTTON_PATTERN.test(descriptor)) {
			score += 8;
		}
		if (button.closest('.right, [class*="right"]')) {
			score += 2;
		}
		if (NATIVE_MORE_BUTTON_EXCLUDE_PATTERN.test(descriptor)) {
			score -= 10;
		}
		return { button, score };
	});

	return scoredButtons
		.sort((first, second) => second.score - first.score)
		.find(({ score }) => score > 0)?.button ?? null;
};

const findNativeAlbumMenuTarget = (album) => {
	const albumId = normalizeComparableText(album?.id);
	const albumName = normalizeComparableText(album?.name);
	const scoredTargets = new Map();
	const menuCandidates = sortElementsByPosition(
		Array.from(document.querySelectorAll('a, button, li, [role="button"], [role="menuitem"], [data-action], [tabindex]'))
			.filter((element) => (
				!element.closest(`#${RNP_VIEW_ID}`)
				&& !element.closest(NATIVE_BOTTOM_BAR_SELECTOR)
				&& isVisibleElement(element)
			))
	);

	for (const element of menuCandidates) {
		const target = getNavigableAncestor(element) ?? (element.matches?.(NATIVE_NAVIGABLE_SELECTOR) ? element : null);
		if (!target || scoredTargets.has(target) || !isVisibleElement(target)) {
			continue;
		}

		const descriptor = getElementDescriptor(target);
		const href = normalizeText(target.getAttribute?.('href'));
		const text = normalizeComparableText(target.textContent);
		let score = 0;
		if (albumId && descriptor.includes(albumId)) {
			score += 10;
		}
		if (albumName && text.includes(albumName)) {
			score += 7;
		}
		if (NATIVE_ALBUM_TARGET_PATTERN.test(descriptor)) {
			score += 6;
		}
		if (/album/.test(href.toLowerCase())) {
			score += 6;
		}
		if (target.closest('[role="menu"], .m-layer, .u-arrlay, [class*="menu"], [class*="popover"], [class*="dropdown"]')) {
			score += 2;
		}
		if (/artist|\u6b4c\u624b|playlist|queue|\u64ad\u653e\u5217\u8868/.test(descriptor)) {
			score -= 4;
		}
		if (score > 0) {
			scoredTargets.set(target, score);
		}
	}

	return [...scoredTargets.entries()]
		.sort((first, second) => second[1] - first[1])
		.map(([target]) => target)[0] ?? null;
};

const waitForNativeMenu = (delay = 80) => new Promise((resolve) => {
	window.setTimeout(resolve, delay);
});

const openArtistFromNativeUI = (artist, fallbackHref = '') => {
	const target = findNativeArtistTarget(artist);
	if (clickNativeNavigationTarget(target)) {
		return closeRnpLyricPageSoon();
	}
	return navigateWithinApp(fallbackHref);
};

const openArtistFromPluginLink = (artist, fallbackHref = '') => {
	if (fallbackHref) {
		return navigateWithinApp(fallbackHref);
	}
	return openArtistFromNativeUI(artist, fallbackHref);
};

const openMoreFromNativeUI = () => {
	const moreButton = findNativeMoreButton();
	if (clickNativeNavigationTarget(moreButton)) {
		armCloseAfterNativeMenu();
		return true;
	}
	return false;
};

const openAlbumFromNativeUI = async (album, fallbackHref = '') => {
	const moreButton = findNativeMoreButton();
	if (clickNativeNavigationTarget(moreButton)) {
		await waitForNativeMenu();
		const albumTarget = findNativeAlbumMenuTarget(album);
		if (clickNativeNavigationTarget(albumTarget)) {
			return closeRnpLyricPageSoon();
		}
	}
	return navigateWithinApp(fallbackHref);
};

const appendLineLink = (container, label, { href = '', onNavigate = null } = {}) => {
	const link = document.createElement('a');
	link.href = href || 'javascript:void(0)';
	const text = document.createElement('span');
	text.textContent = label;
	link.appendChild(text);
	if (href || typeof onNavigate === 'function') {
		const triggerNavigation = () => {
			if (typeof onNavigate === 'function') {
				const handled = onNavigate();
				if (handled) {
					return handled;
				}
			}
			return href ? navigateWithinApp(href) : false;
		};
		link.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		link.addEventListener('mouseup', (event) => {
			event.preventDefault();
			event.stopPropagation();
			triggerNavigation();
		});
		link.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') {
				return;
			}
			event.preventDefault();
			triggerNavigation();
		});
	}
	container.appendChild(link);
	return link;
};

const findNativeBottomBarMetaTextArea = (bottomBar) => {
	if (!bottomBar) {
		return null;
	}

	const currentInfo = getCurrentPlayingInfo();
	const artistNames = currentInfo.artists
		.map((artist) => normalizeComparableText(artist?.name))
		.filter(Boolean);
	const titleText = normalizeComparableText(currentInfo.title);
	if (artistNames.length === 0) {
		return null;
	}

	const candidates = sortElementsByPosition(
		Array.from(bottomBar.querySelectorAll(NATIVE_BOTTOM_BAR_META_TEXT_AREA_SELECTOR)).filter((element) => (
			isVisibleElement(element)
			&& normalizeText(element.textContent)
			&& !element.querySelector('img, picture, video, canvas, [class*="cover"], [class*="vinyl"]')
		))
	);

	const scoreArtistArea = (element) => {
		const text = normalizeComparableText(element.textContent);
		if (!text) {
			return -Infinity;
		}

		let score = 0;
		for (const artistName of artistNames) {
			if (text === artistName) {
				score += 12;
			} else if (text.includes(artistName)) {
				score += 6;
			}
		}
		if (titleText && text.includes(titleText)) {
			score -= 10;
		}
		if (/[/,&]| feat\.| ft\.|、|，|,/.test(text)) {
			score += 1;
		}
		if (/artist|\u6b4c\u624b/.test(getElementDescriptor(element))) {
			score += 3;
		}
		return score;
	};

	const bestCandidate = candidates
		.map((element) => ({ element, score: scoreArtistArea(element) }))
		.sort((first, second) => second.score - first.score)[0];
	if (bestCandidate?.score > 0) {
		return bestCandidate.element;
	}

	const leftHost = bottomBar.querySelector('.left, [class*="left"]');
	if (!leftHost || !isVisibleElement(leftHost)) {
		return null;
	}

	const fallbackCandidates = sortElementsByPosition(
		Array.from(leftHost.querySelectorAll('a, span, p, div, strong, em')).filter((element) => (
			isVisibleElement(element)
			&& normalizeText(element.textContent)
			&& !element.querySelector('img, picture, video, canvas, [class*="cover"], [class*="vinyl"]')
		))
	);
	return fallbackCandidates
		.map((element) => ({ element, score: scoreArtistArea(element) }))
		.sort((first, second) => second.score - first.score)
		.find(({ score }) => score > 0)?.element ?? null;
};

const isNativeBottomBarMetaTextTarget = (element, bottomBar) => {
	const resolvedElement = getEventTargetElement(element);
	if (!resolvedElement || !bottomBar?.contains?.(resolvedElement)) {
		return false;
	}
	if (resolvedElement.closest(NATIVE_BOTTOM_BAR_CONTROL_SELECTOR)) {
		return false;
	}
	const metaHost = resolvedElement.closest(NATIVE_BOTTOM_BAR_META_HOST_SELECTOR);
	if (!metaHost || !bottomBar.contains(metaHost)) {
		return false;
	}
	const artistArea = findNativeBottomBarMetaTextArea(bottomBar);
	if (!artistArea || (!artistArea.contains(resolvedElement) && !resolvedElement.contains?.(artistArea))) {
		return false;
	}
	const textCarrier = resolvedElement.closest('a, span, p, div, strong, em') ?? resolvedElement;
	const text = normalizeText(textCarrier.textContent || metaHost.textContent);
	if (!text) {
		return false;
	}
	const descriptor = `${getElementDescriptor(textCarrier)} ${getElementDescriptor(metaHost)}`;
	return !NATIVE_BOTTOM_BAR_META_TEXT_EXCLUDE_PATTERN.test(descriptor);
};

const getNativeMenuActionTarget = (element) => {
	const resolvedElement = getEventTargetElement(element);
	if (!resolvedElement || resolvedElement.closest?.(`#${RNP_VIEW_ID}`)) {
		return null;
	}

	const menuLayer = resolvedElement.closest?.(NATIVE_MENU_LAYER_SELECTOR);
	if (menuLayer && (!isVisibleElement(menuLayer) || menuLayer.closest(`#${RNP_VIEW_ID}`))) {
		return null;
	}

	const boundary = menuLayer ?? document.body;
	const actionTarget = resolvedElement.closest?.(NATIVE_MENU_ITEM_SELECTOR)
		?? getNavigableAncestor(resolvedElement, boundary)
		?? resolvedElement;
	if (!actionTarget || actionTarget === menuLayer || !isVisibleElement(actionTarget)) {
		return null;
	}
	if (actionTarget.closest?.(`#${RNP_VIEW_ID}`) || actionTarget.closest?.(NATIVE_BOTTOM_BAR_SELECTOR)) {
		return null;
	}

	const descriptor = getElementDescriptor(actionTarget);
	const text = normalizeText(actionTarget.textContent || actionTarget.getAttribute?.('aria-label') || actionTarget.getAttribute?.('title'));
	if (!text || /more|\u66f4\u591a/.test(descriptor)) {
		return null;
	}
	const normalizedText = normalizeComparableText(text);
	const normalizedDescriptor = normalizeComparableText(descriptor);
	const currentInfo = getCurrentPlayingInfo();
	const artistMatched = currentInfo.artists.some((artist) => {
		const name = normalizeComparableText(artist?.name);
		return name && (normalizedText.includes(name) || normalizedDescriptor.includes(name));
	});
	const albumName = normalizeComparableText(currentInfo.album?.name);
	const albumMatched = albumName && (normalizedText.includes(albumName) || normalizedDescriptor.includes(albumName));
	const speedMatched = NATIVE_MENU_SPEED_PATTERN.test(text.toLowerCase()) || /倍速|速度|speed|rate/.test(descriptor);
	const descriptorMatched = NATIVE_MENU_CLOSE_DESCRIPTOR_PATTERN.test(descriptor);
	if (!artistMatched && !albumMatched && !speedMatched && !descriptorMatched) {
		return null;
	}

	return actionTarget;
};

let hasBoundNativeMenuCloseInterceptor = false;
const bindNativeMenuCloseInterceptor = () => {
	if (hasBoundNativeMenuCloseInterceptor) {
		return;
	}
	hasBoundNativeMenuCloseInterceptor = true;
	const handleNativeMenuCloseEvent = (event) => {
		if (!pendingCloseAfterNativeMenu) {
			return;
		}

		const pointTarget = getEventTargetElement(document.elementFromPoint?.(event.clientX ?? 0, event.clientY ?? 0));
		const actionTarget = getNativeMenuActionTarget(event.target) ?? getNativeMenuActionTarget(pointTarget);
		if (actionTarget) {
			disarmCloseAfterNativeMenu();
			window.setTimeout(() => {
				if (document.body.classList.contains(RNP_PAGE_OPEN_CLASS)) {
					closeRnpLyricPage();
				}
			}, 0);
			return;
		}

		const activeMenuLayer = getActiveNativeMenuLayer();
		if (!activeMenuLayer || (!activeMenuLayer.contains(event.target) && !activeMenuLayer.contains(pointTarget))) {
			disarmCloseAfterNativeMenu();
		}
	};
	['pointerup', 'mouseup', 'click'].forEach((eventName) => {
		document.addEventListener(eventName, handleNativeMenuCloseEvent, true);
	});
};

const applyV3LyricPageAlignment = () => {
	const page = getV3LyricPage();
	if (!page) {
		return;
	}

	const wrap = page.querySelector('.g-singlec-ct .n-single .wrap');
	const coverBlock = page.querySelector('.g-singlec-ct .n-single .sd');
	if (!wrap || !coverBlock) {
		return;
	}

	page.style.setProperty('--rnp-v3-meta-offset-x', '0px');
	page.style.setProperty('--rnp-v3-meta-offset-y', '0px');
	page.style.removeProperty('--rnp-v3-cover-width');

	const wrapRect = wrap.getBoundingClientRect();
	const coverRect = coverBlock.getBoundingClientRect();

	if (!wrapRect.width || !wrapRect.height || !coverRect.width || !coverRect.height) {
		return;
	}

	const sideInset = Math.round(Math.min(Math.max(wrapRect.width * 0.018, 12), 20));
	const minLyricWidth = Math.min(520, Math.max(360, wrapRect.width * 0.4));
	const preferredSideWidth = coverRect.width * 1.7;
	const maxSideWidth = Math.max(coverRect.width + 24, wrapRect.width - minLyricWidth);
	const sideWidth = Math.max(
		coverRect.width + 24,
		Math.min(maxSideWidth, preferredSideWidth),
	);
	const leftOffset = Math.round(Math.min(sideInset, Math.max(sideWidth - coverRect.width, 0)));
	const centerOffset = Math.round(Math.max((sideWidth - coverRect.width) / 2, 0));
	const sideOffsetX = document.body.classList.contains('horizontal-align-center')
		? centerOffset
		: leftOffset;

	page.style.setProperty('--rnp-v3-side-inset', `${sideInset}px`);
	page.style.setProperty('--rnp-v3-side-width', `${Math.round(sideWidth)}px`);
	page.style.setProperty('--rnp-v3-side-offset-x', `${sideOffsetX}px`);
};

const updateV3LyricPageInfo = () => {
	const page = document.querySelector(`#${RNP_VIEW_ID} .g-single`);
	if (!page) {
		return;
	}

	const info = getCurrentPlayingInfo();
	const headerName = page.querySelector('.g-singlec-hd .wrap .name');
	const headerLyric = page.querySelector('.g-singlec-hd .wrap .lyric');
	const titleInner = page.querySelector('.title .name .name-inner');
	const alias = page.querySelector('.info .alias');
	const playfrom = page.querySelector('.info .playfrom');
	const coverImage = page.querySelector('.n-single .cdimg img');

	if (headerName) {
		headerName.textContent = info.title;
	}
	if (headerLyric) {
		headerLyric.textContent = info.artistText;
	}
	if (titleInner) {
		titleInner.textContent = info.title;
	}
	if (alias) {
		alias.textContent = info.alias || '\u00a0';
		alias.classList.toggle('empty', !info.alias);
	}
	if (playfrom) {
		clearElementChildren(playfrom);

		const artistLine = document.createElement('li');
		for (const artist of info.artists) {
			const artistHref = artist.id ? `#/m/artist/?id=${artist.id}` : '';
			appendLineLink(
				artistLine,
				artist.name,
				{
					href: artistHref,
					onNavigate: () => openArtistFromPluginLink(artist, artistHref),
				}
			);
		}
		if (artistLine.childNodes.length === 0) {
			const artistName = document.createElement('span');
			artistName.textContent = info.artistText;
			artistLine.appendChild(artistName);
		}

		const albumLine = document.createElement('li');
		appendLineText(albumLine, info.album.name || 'Unknown Album', 'rnp-static-line-text rnp-static-line-album');

		const sourceLine = document.createElement('li');
		sourceLine.classList.add('rnp-song-id-line');
		appendLineLink(
			sourceLine,
			info.songId ? `歌曲 ID ${info.songId}` : '网易云音乐',
			{
				href: info.songId ? `#/m/song/?id=${info.songId}` : '',
			}
		);

		playfrom.appendChild(artistLine);
		playfrom.appendChild(albumLine);
		playfrom.appendChild(sourceLine);
	}
	if (coverImage && coverImage.getAttribute('src') !== info.coverUrl) {
		coverImage.setAttribute('src', info.coverUrl);
	}

	setTimeout(() => {
		recalculateTitleSize(true);
		calcTitleScroll();
		updateCDImage();
		applyV3LyricPageAlignment();
	}, 0);
};

let v3LyricPageUpdateTimer = 0;
const scheduleV3LyricPageInfoUpdate = () => {
	clearTimeout(v3LyricPageUpdateTimer);
	v3LyricPageUpdateTimer = window.setTimeout(() => {
		updateV3LyricPageInfo();
	}, 0);
};

const getV3LyricPage = () => document.querySelector(`#${RNP_VIEW_ID} .g-single`);
const getRnpView = () => document.getElementById(RNP_VIEW_ID);
let pendingCloseAfterNativeMenu = false;
let pendingCloseAfterNativeMenuTimer = 0;

const resetRnpEdgeRevealState = (view = getRnpView()) => {
	view?.classList?.remove(RNP_WINDOW_TOOLS_VISIBLE_CLASS, RNP_CONTROL_THUMB_VISIBLE_CLASS);
};

const isPointInsideExpandedRect = (clientX, clientY, rect, marginX = 0, marginY = marginX) => {
	if (typeof clientX !== 'number' || typeof clientY !== 'number' || !rect) {
		return false;
	}

	return (
		clientX >= (rect.left - marginX)
		&& clientX <= (rect.right + marginX)
		&& clientY >= (rect.top - marginY)
		&& clientY <= (rect.bottom + marginY)
	);
};

const isPointNearElement = (clientX, clientY, element, marginX = 0, marginY = marginX) => {
	const rect = element?.getBoundingClientRect?.();
	if (!rect || rect.width <= 0 || rect.height <= 0) {
		return false;
	}
	return isPointInsideExpandedRect(clientX, clientY, rect, marginX, marginY);
};

const updateRnpEdgeRevealState = (event, view = getRnpView()) => {
	if (!view || !document.body.classList.contains(RNP_PAGE_OPEN_CLASS)) {
		resetRnpEdgeRevealState(view);
		return;
	}
	if (typeof event?.clientX !== 'number' || typeof event?.clientY !== 'number') {
		return;
	}

	const rect = view.getBoundingClientRect();
	if (!rect.width || !rect.height) {
		resetRnpEdgeRevealState(view);
		return;
	}

	const relativeX = event.clientX - rect.left;
	const relativeY = event.clientY - rect.top;
	const topHotzoneHeight = Math.min(Math.max(rect.height * 0.1, 76), 112);
	const bottomHotzoneHeight = Math.min(Math.max(rect.height * 0.12, 92), 132);
	const rightHotzoneWidth = Math.min(Math.max(rect.width * 0.18, 148), 236);
	const windowTools = view.querySelector('.rnp-window-tools');
	const controlThumb = view.querySelector('.rnp-control-thumb');
	const showWindowTools = (
		(relativeY >= 0 && relativeY <= topHotzoneHeight && relativeX >= (rect.width - rightHotzoneWidth))
		|| isPointNearElement(event.clientX, event.clientY, windowTools, 24, 18)
	);
	const showControlThumb = (
		(relativeY >= (rect.height - bottomHotzoneHeight) && relativeY <= rect.height)
		|| isPointNearElement(event.clientX, event.clientY, controlThumb, 24, 24)
	);

	view.classList.toggle(RNP_WINDOW_TOOLS_VISIBLE_CLASS, showWindowTools);
	view.classList.toggle(RNP_CONTROL_THUMB_VISIBLE_CLASS, showControlThumb);
};

const closeNativeNowPlayingPage = () => {
	document.querySelectorAll(`#root .g-single`).forEach((page) => {
		if (page.closest(`#${RNP_VIEW_ID}`)) {
			return;
		}
		page.classList.remove('z-show');
		page.setAttribute('aria-hidden', 'true');
		page.dataset.rnpHidden = 'true';
		page.style.setProperty('visibility', 'hidden', 'important');
		page.style.setProperty('pointer-events', 'none', 'important');
		page.style.setProperty('opacity', '0', 'important');
	});
	document.body.classList.remove('mq-playing-init');
};

const restoreNativeNowPlayingPage = () => {
	document.querySelectorAll(`#root .g-single[aria-hidden="true"]`).forEach((page) => {
		page.removeAttribute('aria-hidden');
		if (page.dataset.rnpHidden === 'true') {
			delete page.dataset.rnpHidden;
			page.style.removeProperty('visibility');
			page.style.removeProperty('pointer-events');
			page.style.removeProperty('opacity');
		}
	});
};

const syncV3LyricPageState = () => {
	const nowPlayingPage = getV3LyricPage();
	const isOpen = document.body.classList.contains(RNP_PAGE_OPEN_CLASS);
	document.body.classList.toggle('mq-playing', isOpen);
	nowPlayingPage?.classList?.toggle('z-show', isOpen);
	if (isOpen) {
		closeNativeNowPlayingPage();
	} else {
		restoreNativeNowPlayingPage();
		resetRnpEdgeRevealState();
	}
	syncRnpWindowControlState();
	return nowPlayingPage;
};

let nativeNowPlayingSuppressionTimerIds = [];
const suppressNativeNowPlayingPage = () => {
	nativeNowPlayingSuppressionTimerIds.forEach((timerId) => clearTimeout(timerId));
	nativeNowPlayingSuppressionTimerIds = [];

	closeNativeNowPlayingPage();
	[0, 32, 96, 180, 320].forEach((delay) => {
		const timerId = window.setTimeout(() => {
			if (document.body.classList.contains(RNP_PAGE_OPEN_CLASS)) {
				closeNativeNowPlayingPage();
			}
		}, delay);
		nativeNowPlayingSuppressionTimerIds.push(timerId);
	});
};

const openRnpLyricPage = () => {
	createV3LyricPage();
	resetRnpEdgeRevealState();
	document.body.classList.add(RNP_PAGE_OPEN_CLASS);
	syncV3LyricPageState();
	suppressNativeNowPlayingPage();
	window.dispatchEvent(new Event('rnp-lyric-page-opened'));
	scheduleV3LyricPageInfoUpdate();
};

const closeRnpLyricPage = () => {
	nativeNowPlayingSuppressionTimerIds.forEach((timerId) => clearTimeout(timerId));
	nativeNowPlayingSuppressionTimerIds = [];
	document.body.classList.remove(RNP_PAGE_OPEN_CLASS);
	resetRnpEdgeRevealState();
	syncV3LyricPageState();
	window.dispatchEvent(new Event('rnp-lyric-page-closed'));
};

const onLyricPageButtonClickedV3 = (event) => {
	if (event.shiftKey) {
		return;
	}

	suppressEvent(event);
	openRnpLyricPage();
};

const stopNativeNowPlayingEvent = (event) => {
	suppressEvent(event);
};

const suppressEvent = (event) => {
	event.preventDefault();
	event.stopImmediatePropagation();
	event.stopPropagation();
};

const suppressEventAndBlur = (event) => {
	suppressEvent(event);
	event.currentTarget?.blur?.();
};

const getEventTargetElement = (value) => {
	const target = value?.target ?? value;
	if (!target) {
		return null;
	}
	return target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
};

const isEventPointInsideElement = (event, element) => {
	if (!element || typeof event?.clientX !== 'number' || typeof event?.clientY !== 'number') {
		return false;
	}
	const rect = element.getBoundingClientRect();
	return rect.width > 0
		&& rect.height > 0
		&& event.clientX >= rect.left
		&& event.clientX <= rect.right
		&& event.clientY >= rect.top
		&& event.clientY <= rect.bottom;
};

const sortElementsByPosition = (elements) => [...elements].sort((first, second) => {
	const firstRect = first.getBoundingClientRect?.() ?? { top: 0, left: 0 };
	const secondRect = second.getBoundingClientRect?.() ?? { top: 0, left: 0 };
	if (Math.abs(firstRect.top - secondRect.top) > 2) {
		return firstRect.top - secondRect.top;
	}
	return firstRect.left - secondRect.left;
});

const getElementDescriptor = (element) => [
	element?.getAttribute?.('aria-label'),
	element?.getAttribute?.('title'),
	element?.getAttribute?.('data-action'),
	element?.getAttribute?.('class'),
	element?.textContent,
	...Array.from(element?.children ?? []).flatMap((child) => [
		child.getAttribute?.('aria-label'),
		child.getAttribute?.('title'),
		child.getAttribute?.('class'),
	]),
].join(' ').toLowerCase();

const isVisibleElement = (element) => {
	const rect = element?.getBoundingClientRect?.();
	return Boolean(rect && rect.width > 0 && rect.height > 0);
};

const getElementCenterPoint = (element) => {
	const rect = element?.getBoundingClientRect?.();
	if (!rect) {
		return {};
	}
	return {
		clientX: rect.left + (rect.width / 2),
		clientY: rect.top + (rect.height / 2),
	};
};

const clickDomElement = (target, point = null) => {
	if (!target) {
		return false;
	}

	let dispatchTarget = target;
	if (point) {
		const pointTarget = getEventTargetElement(document.elementFromPoint?.(point.clientX, point.clientY));
		if (pointTarget instanceof HTMLElement && (pointTarget === target || target.contains?.(pointTarget))) {
			dispatchTarget = getInteractiveWindowControlAncestor(pointTarget, target) ?? pointTarget;
		}
	}

	const eventInit = {
		bubbles: true,
		cancelable: true,
		composed: true,
		view: window,
		button: 0,
		...(point ?? {}),
	};
	const dispatchEventByType = (eventName, buttons) => {
		const resolvedEventInit = {
			...eventInit,
			buttons,
		};
		if (eventName.startsWith('pointer') && typeof PointerEvent === 'function') {
			dispatchTarget.dispatchEvent(new PointerEvent(eventName, {
				...resolvedEventInit,
				pointerId: 1,
				isPrimary: true,
				pointerType: 'mouse',
			}));
			return;
		}
		dispatchTarget.dispatchEvent(new MouseEvent(eventName, resolvedEventInit));
	};
	dispatchEventByType('pointerdown', 1);
	dispatchEventByType('mousedown', 1);
	dispatchEventByType('pointerup', 0);
	dispatchEventByType('mouseup', 0);
	if (typeof dispatchTarget.click === 'function') {
		dispatchTarget.click();
	} else if (dispatchTarget !== target && typeof target.click === 'function') {
		target.click();
	}
	return true;
};

const isWindowControlGroupLeftAnchored = (group) => {
	const rect = group?.getBoundingClientRect?.();
	if (!rect) {
		return false;
	}
	return rect.left < (window.innerWidth / 2);
};

const getNativeWindowControlGroup = () => {
	const groups = Array.from(document.querySelectorAll(NATIVE_WINDOW_CONTROL_SELECTOR))
		.filter((group) => !group.closest(`#${RNP_VIEW_ID}`) && isVisibleElement(group))
		.map((group) => ({
			group,
			buttons: getNativeWindowControlButtons(group),
		}))
		.filter(({ buttons }) => buttons.length >= 2)
		.sort((first, second) => {
			const firstRect = first.group.getBoundingClientRect();
			const secondRect = second.group.getBoundingClientRect();
			if (Math.abs(firstRect.top - secondRect.top) > 2) {
				return firstRect.top - secondRect.top;
			}
			if (first.buttons.length !== second.buttons.length) {
				return Math.abs(first.buttons.length - 3) - Math.abs(second.buttons.length - 3);
			}
			return secondRect.right - firstRect.right;
		});
	return groups[0]?.group ?? null;
};

const getInteractiveWindowControlAncestor = (candidate, group) => {
	for (let element = candidate; element && element !== group; element = element.parentElement) {
		if (element.matches?.(INTERACTIVE_WINDOW_CONTROL_SELECTOR)) {
			return element;
		}
	}
	return null;
};

const getNativeWindowControlButtons = (group = getNativeWindowControlGroup()) => {
	if (!group) {
		return [];
	}

	const uniqueTargets = new Set();
	const candidates = [
		...Array.from(group.querySelectorAll(INTERACTIVE_WINDOW_CONTROL_SELECTOR)),
		...Array.from(group.children).filter((child) => child instanceof HTMLElement),
	];
	for (const candidate of candidates) {
		const resolvedTarget = getInteractiveWindowControlAncestor(candidate, group) ?? candidate;
		if (resolvedTarget instanceof HTMLElement && isVisibleElement(resolvedTarget)) {
			uniqueTargets.add(resolvedTarget);
		}
	}

	return sortElementsByPosition(Array.from(uniqueTargets));
};

const getPrimaryWindowControlButtons = (group = getNativeWindowControlGroup(), buttons = getNativeWindowControlButtons(group)) => {
	if (buttons.length <= 3) {
		return buttons;
	}

	const orderedButtons = sortElementsByPosition(buttons);

	return isWindowControlGroupLeftAnchored(group)
		? orderedButtons.slice(0, 3)
		: orderedButtons.slice(-3);
};

const getWindowControlSlotPoint = (group, action) => {
	const rect = group?.getBoundingClientRect?.();
	if (!rect) {
		return null;
	}

	const isLeftAnchored = isWindowControlGroupLeftAnchored(group);
	const order = isLeftAnchored
		? ['close', 'minimize', 'maximize']
		: ['minimize', 'maximize', 'close'];
	const index = Math.max(order.indexOf(action), 0);
	return {
		clientX: rect.left + (rect.width * ((index * 2) + 1)) / (order.length * 2),
		clientY: rect.top + (rect.height / 2),
	};
};

const getNativeWindowControlButton = (action) => {
	const group = getNativeWindowControlGroup();
	const buttons = getNativeWindowControlButtons(group);
	if (buttons.length === 0) {
		return null;
	}

	const labelledButton = buttons.find((button) => WINDOW_CONTROL_LABEL_PATTERNS[action]?.test(getElementDescriptor(button)));
	if (labelledButton) {
		return labelledButton;
	}

	const primaryButtons = getPrimaryWindowControlButtons(group, buttons);
	if (primaryButtons.length >= 3) {
		const orderedButtons = [...primaryButtons].sort((first, second) => {
			const firstRect = first.getBoundingClientRect();
			const secondRect = second.getBoundingClientRect();
			return firstRect.left - secondRect.left;
		});
		if (isWindowControlGroupLeftAnchored(group)) {
			switch (action) {
				case 'close':
					return orderedButtons[0] ?? null;
				case 'minimize':
					return orderedButtons[1] ?? orderedButtons[0] ?? null;
				case 'maximize':
					return orderedButtons[2] ?? orderedButtons[orderedButtons.length - 1] ?? null;
				default:
					break;
			}
		} else {
			switch (action) {
				case 'minimize':
					return orderedButtons[0] ?? null;
				case 'maximize':
					return orderedButtons[1] ?? orderedButtons[0] ?? null;
				case 'close':
					return orderedButtons[orderedButtons.length - 1] ?? null;
				default:
					break;
			}
		}
	}

	const slotPoint = getWindowControlSlotPoint(group, action);
	if (slotPoint) {
		const nearestButton = [...buttons].sort((first, second) => {
			const firstPoint = getElementCenterPoint(first);
			const secondPoint = getElementCenterPoint(second);
			const firstDistance = Math.hypot((firstPoint.clientX ?? 0) - slotPoint.clientX, (firstPoint.clientY ?? 0) - slotPoint.clientY);
			const secondDistance = Math.hypot((secondPoint.clientX ?? 0) - slotPoint.clientX, (secondPoint.clientY ?? 0) - slotPoint.clientY);
			return firstDistance - secondDistance;
		})[0];
		if (nearestButton) {
			return nearestButton;
		}
	}

	switch (action) {
		case 'minimize':
			return buttons[0] ?? null;
		case 'maximize':
			return buttons[Math.max(buttons.length - 2, 1)] ?? buttons[1] ?? null;
		case 'close':
			return buttons[buttons.length - 1] ?? null;
		default:
			return null;
	}
};

const triggerNativeWindowAction = (action) => {
	const target = getNativeWindowControlButton(action);
	if (target && clickDomElement(target, getElementCenterPoint(target))) {
		return true;
	}

	const group = getNativeWindowControlGroup();
	const slotPoint = getWindowControlSlotPoint(group, action);
	if (group && slotPoint && clickDomElement(group, slotPoint)) {
		return true;
	}
	if (action === 'close' && typeof window.close === 'function') {
		window.close();
		return true;
	}
	return false;
};

const dragRnpWindow = () => {
	if (typeof channel?.call === 'function') {
		channel.call('winhelper.dragWindow', () => {}, []);
		return true;
	}
	if (window.legacyNativeCmder?._envAdapter?.callAdapter) {
		window.legacyNativeCmder._envAdapter.callAdapter('winhelper.dragWindow', () => {}, []);
		return true;
	}
	return false;
};

const syncRnpWindowControlState = () => {
	const fullScreenButton = document.querySelector(`#${RNP_VIEW_ID} .rnp-window-tool-fullscreen`);
	if (!fullScreenButton) {
		return;
	}
	const isFullScreen = Boolean(document.fullscreenElement);
	fullScreenButton.classList.toggle('is-active', isFullScreen);
	fullScreenButton.title = isFullScreen ? '退出全屏' : '全屏';
	fullScreenButton.setAttribute('aria-label', isFullScreen ? '退出全屏' : '全屏');
};

const getNativeNowPlayingTrigger = (event) => {
	const target = getEventTargetElement(event);
	if (!target?.closest) {
		return null;
	}
	if (target.closest(`#${RNP_VIEW_ID}`)) {
		return null;
	}

	const vinylButton = target.closest(NATIVE_LYRIC_PAGE_BUTTON_SELECTOR);
	if (vinylButton) {
		return vinylButton;
	}

	const bottomBar = target.closest(NATIVE_BOTTOM_BAR_SELECTOR)
		?? Array.from(document.querySelectorAll(NATIVE_BOTTOM_BAR_SELECTOR)).find((candidate) => (
			!candidate.closest(`#${RNP_VIEW_ID}`) && isEventPointInsideElement(event, candidate)
		));
	if (!bottomBar) {
		return null;
	}
	const pointTarget = getEventTargetElement(document.elementFromPoint?.(event.clientX ?? 0, event.clientY ?? 0));
	const metaTextArea = findNativeBottomBarMetaTextArea(bottomBar);
	if (metaTextArea && (
		metaTextArea.contains(target)
		|| metaTextArea.contains(pointTarget)
		|| isEventPointInsideElement(event, metaTextArea)
	)) {
		return null;
	}
	const controlTarget = target.closest(NATIVE_BOTTOM_BAR_CONTROL_SELECTOR)
		?? pointTarget?.closest?.(NATIVE_BOTTOM_BAR_CONTROL_SELECTOR)
		?? getNavigableAncestor(target, bottomBar)
		?? getNavigableAncestor(pointTarget, bottomBar);
	if (controlTarget && controlTarget !== bottomBar && bottomBar.contains(controlTarget)) {
		return null;
	}
	if (isNativeBottomBarMetaTextTarget(target, bottomBar) || isNativeBottomBarMetaTextTarget(pointTarget, bottomBar)) {
		return null;
	}
	return bottomBar;
};

let lastNativeNowPlayingTriggerTime = 0;
const openRnpLyricPageFromNativeEvent = (event) => {
	const now = Date.now();
	if (now - lastNativeNowPlayingTriggerTime < 250) {
		return;
	}
	lastNativeNowPlayingTriggerTime = now;
	openRnpLyricPage();
};

const onNativeNowPlayingTriggerEvent = (event) => {
	if (event.shiftKey) {
		return;
	}
	if (!getNativeNowPlayingTrigger(event)) {
		return;
	}

	stopNativeNowPlayingEvent(event);
	if (event.type === 'pointerup' || event.type === 'mouseup' || event.type === 'click') {
		openRnpLyricPageFromNativeEvent(event);
	}
};

let hasBoundNativeNowPlayingInterceptor = false;
const bindNativeNowPlayingInterceptor = () => {
	if (hasBoundNativeNowPlayingInterceptor) {
		return;
	}
	hasBoundNativeNowPlayingInterceptor = true;
	['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
		document.addEventListener(eventName, onNativeNowPlayingTriggerEvent, true);
	});
};

let hasInjectedV3LyricPage = false;
let v3LyricPageButtonObserver = null;
const bindV3LyricPageButton = (button) => {
	if (!button || button.dataset.rnpLyricPageBound === 'true') {
		return false;
	}

	button.dataset.rnpLyricPageBound = 'true';
	button.addEventListener('click', onLyricPageButtonClickedV3, true);
	return true;
};

const syncRnpPageWindowTools = (view) => {
	if (!view) {
		return;
	}

	const windowTools = view.querySelector('.rnp-window-tools');
	view.querySelectorAll('.rnp-window-tool-minimize, .rnp-window-tool-maximize, .rnp-window-tool-close').forEach((button) => {
		button.remove();
	});
	const fullScreenButton = view.querySelector('.rnp-window-tool-fullscreen');
	fullScreenButton?.setAttribute('title', '全屏');
	fullScreenButton?.setAttribute('aria-label', '全屏');
	if (windowTools && !windowTools.querySelector('.rnp-window-tool-plugin-close')) {
		const pluginCloseButton = document.createElement('button');
		pluginCloseButton.type = 'button';
		pluginCloseButton.className = 'rnp-window-tool rnp-window-tool-plugin-close';
		pluginCloseButton.title = '关闭正在播放页';
		pluginCloseButton.setAttribute('aria-label', '关闭正在播放页');
		windowTools.appendChild(pluginCloseButton);
	}
	const topCloseButton = view.querySelector('.rnp-window-tool-plugin-close');
	topCloseButton?.setAttribute('title', '关闭正在播放页');
	topCloseButton?.setAttribute('aria-label', '关闭正在播放页');
	if (topCloseButton && topCloseButton.dataset.rnpCloseBound !== 'true') {
		topCloseButton.dataset.rnpCloseBound = 'true';
		topCloseButton.addEventListener('click', (event) => {
			suppressEventAndBlur(event);
			resetRnpEdgeRevealState(view);
			closeRnpLyricPage();
		});
	}
	const bottomCloseButton = view.querySelector('.rnp-control-thumb');
	bottomCloseButton?.setAttribute('title', '关闭正在播放页');
	bottomCloseButton?.setAttribute('aria-label', '关闭正在播放页');
};

const createV3LyricPage = () => {
	const existingView = document.getElementById(RNP_VIEW_ID);
	if (existingView) {
		existingView.querySelector('.g-singlec-hd')?.remove();
		syncRnpPageWindowTools(existingView);
		resetRnpEdgeRevealState(existingView);
		return getV3LyricPage();
	}

	const view = document.createElement('div');
	view.id = RNP_VIEW_ID;
	view.innerHTML = `
		<div class="rnp-window-topbar">
			<div class="rnp-window-drag-region" aria-hidden="true"></div>
			<div class="rnp-window-tools">
				<button type="button" class="rnp-window-tool rnp-window-tool-minimize" title="最小化" aria-label="最小化"></button>
				<button type="button" class="rnp-window-tool rnp-window-tool-maximize" title="窗口缩放" aria-label="窗口缩放"></button>
				<button type="button" class="rnp-window-tool rnp-window-tool-close" title="关闭窗口" aria-label="关闭窗口"></button>
				<button type="button" class="rnp-window-tool rnp-window-tool-fullscreen" title="全屏" aria-label="全屏"></button>
			</div>
		</div>
		<div class="rnp-bottom-hover-zone">
			<button type="button" class="rnp-control-thumb" title="关闭正在播放页" aria-label="关闭正在播放页">
				<span class="rnp-control-thumb-bar"></span>
				<span class="rnp-control-thumb-close rnp-control-thumb-close-a"></span>
				<span class="rnp-control-thumb-close rnp-control-thumb-close-b"></span>
			</button>
		</div>
		<div class="g-single g-single-track">
			<div class="g-singlec-ct">
				<div class="n-single">
					<div class="wrap">
						<div class="rnp-v3-side">
							<div class="sd">
								<div class="sd-wrap">
									<div class="cdwrap">
										<div class="cd">
											<div class="cdin">
												<div class="cdimg">
													<img class="j-flag" src="${EMPTY_IMAGE_URL}" alt="">
												</div>
											</div>
										</div>
										<div class="cdbg"></div>
										<div class="cdrun"></div>
										<div class="cdbox"></div>
									</div>
									<div class="rnp-cover-favorite-host"></div>
								</div>
							</div>
							<div class="content">
								<div class="mn">
									<div class="head">
										<div class="inf">
											<div class="title">
												<h1>
													<span class="name">
														<span class="name-marquee-track">
															<span class="name-inner"></span>
															<span class="name-duplicate" aria-hidden="true"></span>
														</span>
														<span class="tag-wrap"></span>
													</span>
												</h1>
											</div>
											<div class="info">
												<div class="alias"></div>
												<ul class="playfrom"></ul>
												<button type="button" class="rnp-info-more-button" title="更多" aria-label="更多"></button>
											</div>
										</div>
									</div>
									<div class="rnp-v3-controls-host"></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	`;
	document.body.prepend(view);
	syncRnpPageWindowTools(view);
	view.addEventListener('pointermove', (event) => {
		updateRnpEdgeRevealState(event, view);
	});
	view.addEventListener('pointerleave', () => {
		resetRnpEdgeRevealState(view);
	});
	view.querySelector('.rnp-control-thumb')?.addEventListener('click', (event) => {
		suppressEventAndBlur(event);
		resetRnpEdgeRevealState(view);
		closeRnpLyricPage();
	});
	view.querySelector('.rnp-window-drag-region')?.addEventListener('mousedown', (event) => {
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		dragRnpWindow();
	});
	view.querySelector('.rnp-window-tool-minimize')?.addEventListener('click', (event) => {
		suppressEventAndBlur(event);
		triggerNativeWindowAction('minimize');
	});
	view.querySelector('.rnp-window-tool-maximize')?.addEventListener('click', (event) => {
		suppressEventAndBlur(event);
		triggerNativeWindowAction('maximize');
	});
	view.querySelector('.rnp-window-tool-close')?.addEventListener('click', (event) => {
		suppressEventAndBlur(event);
		triggerNativeWindowAction('close');
	});
	view.querySelector('.rnp-window-tool-fullscreen')?.addEventListener('click', (event) => {
		suppressEventAndBlur(event);
		toggleFullScreen();
	});
	view.querySelector('.rnp-info-more-button')?.addEventListener('click', (event) => {
		suppressEventAndBlur(event);
		openMoreFromNativeUI();
	});
	syncRnpWindowControlState();

	try {
		const store = getNCMStore();
		store?.subscribe?.(() => {
			scheduleV3LyricPageInfoUpdate();
		});
		appendRegisterCall('Load', 'audioplayer', () => {
			scheduleV3LyricPageInfoUpdate();
		});
	} catch (error) {
		console.warn('Failed to bind V3 lyric page updates', error);
	}
	scheduleV3LyricPageInfoUpdate();
	return getV3LyricPage();
};

const injectV3LyricPage = async () => {
	bindNativeNowPlayingInterceptor();
	bindNativeMenuCloseInterceptor();

	if (v3LyricPageButtonObserver) {
		return;
	}

	const bindCurrentV3LyricPageButton = () => {
		const lyricPageButton = document.querySelector('.miniVinylWrapper');
		if (!lyricPageButton) {
			return false;
		}

		const didBind = bindV3LyricPageButton(lyricPageButton);
		hasInjectedV3LyricPage = hasInjectedV3LyricPage || didBind;
		return didBind;
	};

	await betterncm.utils.waitForElement('.miniVinylWrapper');
	bindCurrentV3LyricPageButton();

	v3LyricPageButtonObserver = new MutationObserver(() => {
		bindCurrentV3LyricPageButton();
	});
	v3LyricPageButtonObserver.observe(document.body, { childList: true, subtree: true });
};

const addOrRemoveGlobalClassByOption = (className, optionValue) => {
	document.body.classList.toggle(className, Boolean(optionValue));
}

let shouldSettingMenuReload = true;
const addSettingsMenu = async () => {
	if (shouldSettingMenuReload) {
		shouldSettingMenuReload = false;
	} else {
		return;
	}

	const sliderEnhance = (slider) => {
		const isMidSlider = slider.classList.contains("mid-slider");
		slider.addEventListener("input", e => {
			const value = e.target.value;
			const min = e.target.min;
			const max = e.target.max;
			const percent = (value - min) / (max - min);
			let bg = `linear-gradient(90deg, var(--rnp-accent-color) ${percent * 100}%, #dfe1e422 ${percent * 100}%)`;
			if (!isMidSlider) e.target.style.background = bg;

			if (value !== e.target.getAttribute("default")) {
				e.target.parentElement.classList.add("changed");
			} else {
				e.target.parentElement.classList.remove("changed");
			}
		});
		if (slider.parentElement.querySelector(".rnp-slider-reset")) {
			slider.parentElement.querySelector(".rnp-slider-reset").addEventListener("click", e => {
				const slider = e.target.parentElement.parentElement.querySelector(".rnp-slider");
				slider.value = slider.getAttribute("default");
				slider.dispatchEvent(new Event("input"));
				slider.dispatchEvent(new Event("change"));
			});
		}
		slider.dispatchEvent(new Event("input"));
	}
	const bindCheckboxToClass = (checkbox, className, defaultValue = false, callback = () => {}) => {
		checkbox.checked = getSetting(checkbox.id, defaultValue);
		checkbox.addEventListener("change", e => {
			shouldSettingMenuReload = true;
			setSetting(checkbox.id, e.target.checked);
			addOrRemoveGlobalClassByOption(className, e.target.checked);
			callback(e.target.checked);
		});
		addOrRemoveGlobalClassByOption(className, checkbox.checked);
		callback(checkbox.checked);
	}
	const bindCheckboxToFunction = (checkbox, func, defaultValue = false) => {
		checkbox.checked = getSetting(checkbox.id, defaultValue);
		checkbox.addEventListener("change", e => {
			shouldSettingMenuReload = true;
			setSetting(checkbox.id, e.target.checked);
			func(e.target.checked);
		});
		func(checkbox.checked);
	}
	const bindSlider = (slider, { variable = null, func = null, defaultValue = 0, event = 'input', mapping = (x) => x, addClassWhenAdjusting = '' } = {}) => {
		slider.value = getSetting(slider.id, defaultValue);
		slider.dispatchEvent(new Event("input"));
		const applyValue = (value) => {
			const mapped = mapping(value);
			if (variable) document.body.style.setProperty(variable, mapped);
			if (func) func(mapped);
		};
		slider.addEventListener(event, e => {
			applyValue(e.target.value);
		});
		slider.addEventListener("change", e => {
			shouldSettingMenuReload = true;
			setSetting(slider.id, e.target.value);
		});
		if (addClassWhenAdjusting) {
			slider.addEventListener("mousedown", e => {
				document.body.classList.add(addClassWhenAdjusting);
			});
			slider.addEventListener("mouseup", e => {
				document.body.classList.remove(addClassWhenAdjusting);
			});
		}
		applyValue(slider.value);
		sliderEnhance(slider);
	}
	const bindSliderToCSSVariable = (slider, variable, defaultValue = 0, event = 'input', mapping = (x) => x, addClassWhenAdjusting = '') => {
		bindSlider(slider, { variable, defaultValue, event, mapping, addClassWhenAdjusting });
	}
	const bindSliderToFunction = (slider, func, defaultValue = 0, event = 'input', mapping = (x) => x, addClassWhenAdjusting = '') => {
		bindSlider(slider, { func, defaultValue, event, mapping, addClassWhenAdjusting });
	}
	const bindSelectGroupToClasses = (selectGroup, defaultValue, mapping = (x) => { return x }, callback = (x) => {}) => {
		const buttons = selectGroup.querySelectorAll(".rnp-select-group-btn");
		buttons.forEach(button => {
			button.addEventListener("click", e => {
				const value = e.target.getAttribute("value");
				buttons.forEach(button => {
					button.classList.remove("selected");
					document.body.classList.remove(mapping(button.getAttribute("value")));
				});
				e.target.classList.add("selected");
				document.body.classList.add(mapping(value));
				shouldSettingMenuReload = true;
				setSetting(selectGroup.id, value);
				callback(value);
			});
		});
		const value = getSetting(selectGroup.id, defaultValue);
		buttons.forEach(button => {
			if (button.getAttribute("value") === value) {
				button.classList.add("selected");
				document.body.classList.add(mapping(value));
			} else {
				button.classList.remove("selected");
				document.body.classList.remove(mapping(button.getAttribute("value")));
			}
		});
		callback(value);
	}
	const getOptionDom = (selector) => document.querySelector(selector);


	const initSettings = () => {
		// 外观
		const exclusiveModes = getOptionDom('#exclusive-modes');
		const centerLyric = getOptionDom('#center-lyric');
		const autoHideMiniSongInfo = getOptionDom('#auto-hide-mini-song-info');
		const colorScheme = getOptionDom('#color-scheme');
		const accentColorVariant = getOptionDom('#accent-color-variant');
		const textShadow = getOptionDom('#text-shadow');
		const textGlow = getOptionDom('#text-glow');
		const enableProgressbarPreview = getOptionDom('#enable-progressbar-preview');
		const hidePlayerControls = getOptionDom('#hide-player-controls');
		bindSelectGroupToClasses(exclusiveModes, 'none', (x) => x === 'all' ? 'no-exclusive-mode' : x, () => {
			window.dispatchEvent(new Event('recalc-lyrics'));
			recalculateTitleSize();
		});
		bindCheckboxToClass(centerLyric, 'center-lyric', false);
		bindCheckboxToClass(autoHideMiniSongInfo, 'auto-hide-mini-song-info', true);
		bindSelectGroupToClasses(colorScheme, 'auto', (x) => `rnp-${x}`);
		bindSelectGroupToClasses(accentColorVariant, 'primary', (x) => `accent-color-${x}`, (x) => {
			if (x == 'off') document.body.classList.remove('enable-accent-color');
			else document.body.classList.add('enable-accent-color');
			window.accentColorVariant = (x == 'off') ? 'primary' : x;
			recalcAccentColor();
		});
		bindCheckboxToClass(textShadow, 'rnp-shadow', false, (x) => {
			if (x) {
				textGlow.checked = false;
				textGlow.dispatchEvent(new Event('change'));
			}
		});
		bindCheckboxToClass(textGlow, 'rnp-text-glow', false, (x) => {
			if (x) {
				textShadow.checked = false;
				textShadow.dispatchEvent(new Event('change'));
			}
		});
		bindCheckboxToClass(enableProgressbarPreview, 'enable-progressbar-preview', true);
		bindCheckboxToClass(hidePlayerControls, 'hide-player-controls', false, () => {
			recalculateTitleSize(true);
			applyV3LyricPageAlignment();
		});


		// 封面
		const horizontalAlign = getOptionDom('#horizontal-align');
		const verticalAlign = getOptionDom('#vertical-align');
		const rectangleCover = getOptionDom('#rectangle-cover');
		const albumSize = getOptionDom('#album-size');
		const coverBlurryShadow = getOptionDom('#cover-blurry-shadow');
		bindSelectGroupToClasses(horizontalAlign, 'left', (x) => { return `horizontal-align-${x}` }, () => {
			recalculateTitleSize();
			scheduleV3LyricPageInfoUpdate();
		});
		bindSelectGroupToClasses(verticalAlign, 'bottom', (x) => { return `vertical-align-${x}` }, () => {
			recalculateTitleSize();
			scheduleV3LyricPageInfoUpdate();
		});
		bindCheckboxToClass(rectangleCover, 'rectangle-cover', true);
		bindSliderToFunction(albumSize, (x) => {
			window.albumSize = resolveAlbumImageSize(x);
			document.querySelectorAll('.n-single .cdimg img').forEach((img) => {
				if (!img?.src) return;
				const newSrc = applyAlbumImageSize(img.src, window.albumSize);
				if (img.src !== newSrc) {
					img.src = newSrc;
				}
			});
			scheduleV3LyricPageInfoUpdate();
		}, 200, 'input');
		bindCheckboxToClass(coverBlurryShadow, 'cover-blurry-shadow', true, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-cover-shadow-type', { detail: { type: x ? 'colorful' : 'black' } }));
		});

		// 背景
		const backgroundType = getOptionDom('#background-type');
		const bgBlur = getOptionDom('#bg-blur');
		const bgDim = getOptionDom('#bg-dim');
		const bgDimForGradientBg = getOptionDom('#bg-dim-for-gradient-bg');
		const bgDimForFluidBg = getOptionDom('#bg-dim-for-fluid-bg');
		const bgBlurForNoneBgMask = getOptionDom('#bg-blur-for-none-bg-mask');
		const bgDimForNoneBgMask = getOptionDom('#bg-dim-for-none-bg-mask');
		const gradientBgDynamic = getOptionDom('#gradient-bg-dynamic');
		const staticFluid = getOptionDom('#static-fluid');
		bindSelectGroupToClasses(backgroundType, 'blur', (x) => `rnp-bg-${x}`, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-background-type', { detail: { type: x } }));
		});
		bindSliderToCSSVariable(bgBlur, '--bg-blur', 90, 'change', (x) => { return `${x}px` });
		bindSliderToCSSVariable(bgDim, '--bg-dim', 55, 'change', (x) => { return x / 100 });
		bindSliderToCSSVariable(bgDimForGradientBg, '--bg-dim-for-gradient-bg', 45, 'change', (x) => { return x / 100 });
		bindSliderToCSSVariable(bgDimForFluidBg, '--bg-dim-for-fluid-bg', 30, 'change', (x) => { return x / 100 });
		bindSliderToCSSVariable(bgBlurForNoneBgMask, '--bg-blur-for-none-bg-mask', 0, 'change', (x) => { return `${x}px` });
		bindSliderToCSSVariable(bgDimForNoneBgMask, '--bg-dim-for-none-bg-mask', 0, 'change', (x) => { return x / 100 });
		bindCheckboxToClass(gradientBgDynamic, 'gradient-bg-dynamic', true);
		bindCheckboxToClass(staticFluid, 'static-fluid', false, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-static-fluid', { detail: x }));
		});

		// 歌词
		const originalLyricBold = getOptionDom('#original-lyric-bold');
		const lyricFontSize = getOptionDom('#lyric-font-size');
		const lyricRomajiSizeEm = getOptionDom('#lyric-romaji-size-em');
		const lyricTranslationSizeEm = getOptionDom('#lyric-translation-size-em');
		const lyricFade = getOptionDom('#lyric-fade');
		const lyricZoom = getOptionDom('#lyric-zoom');
		const lyricBlur = getOptionDom('#lyric-blur');
		const lyricRotate = getOptionDom('#lyric-rotate');
		const rotateCurvature = getOptionDom('#rotate-curvature');
		const karaokeAnimation = getOptionDom('#karaoke-animation');
		const currentLyricAlignmentPercentage = getOptionDom('#current-lyric-alignment-percentage');
		const lyricStagger = getOptionDom('#lyric-stagger');
		const lyricAnimationTiming = getOptionDom('#lyric-animation-timing');
		const lyricGlow = getOptionDom('#lyric-glow');
		const lyricContributorsDisplay = getOptionDom('#lyric-contributors-display');
		

		bindCheckboxToClass(originalLyricBold, 'original-lyric-bold', true);

		bindSliderToFunction(lyricFontSize, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-font-size', { detail: x }));
		}, 32, 'change');
		bindSliderToFunction(lyricRomajiSizeEm, (x) => {
			document.body.style.setProperty('--lyric-romaji-size-em', `${x}em`);
			window.dispatchEvent(new Event('recalc-lyrics'));
		}, 0.6, 'change');
		bindSliderToFunction(lyricTranslationSizeEm, (x) => {
			document.body.style.setProperty('--lyric-translation-size-em', `${x}em`);
			window.dispatchEvent(new Event('recalc-lyrics'));
		}, 1.0, 'change');

		bindCheckboxToFunction(lyricZoom, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-zoom', { detail: x }));
		}, false);
		bindCheckboxToFunction(lyricFade, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-fade', { detail: x }));
		}, false);
		bindCheckboxToFunction(lyricBlur, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-blur', { detail: x }));
		}, false);
		bindCheckboxToClass(lyricRotate, 'lyric-rotate', false, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-rotate', { detail: x }));
		});
		bindSliderToFunction(rotateCurvature, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-rotate-curvature', { detail: x }));
		}, 25, 'change');
		bindSelectGroupToClasses(karaokeAnimation, 'float', (x) => `rnp-karaoke-animation-${x}`, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-karaoke-animation', { detail: x }));
		});
		bindSelectGroupToClasses(currentLyricAlignmentPercentage, '50', (x) => `rnp-current-lyric-alignment-${x}`, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-current-lyric-alignment-percentage', { detail: parseInt(x) }));
		});
		bindCheckboxToFunction(lyricStagger, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-stagger', { detail: x }));
		}, true);
		bindSelectGroupToClasses(lyricAnimationTiming, 'smooth', (x) => `rnp-lyric-animation-timing-${x}`);
		bindCheckboxToFunction(lyricGlow, (x) => {
			document.dispatchEvent(new CustomEvent('rnp-lyric-glow', { detail: x }));
		}, true);
		bindSelectGroupToClasses(lyricContributorsDisplay, 'hover', (x) => `rnp-lyric-contributors-${x}`);

		const lyricOffsetSlider = getOptionDom('#rnp-lyric-offset-slider');
		const lyricOffsetAdd = getOptionDom('#rnp-lyric-offset-add');
		const lyricOffsetSub = getOptionDom('#rnp-lyric-offset-sub');
		const lyricOffsetReset = getOptionDom('#rnp-lyric-offset-reset');
		const lyricOffsetNumber = getOptionDom('#rnp-lyric-offset-number');
		const lyricOffsetTip = getOptionDom('#rnp-lyric-offset-tip');
		bindSliderToFunction(lyricOffsetSlider, (ms) => {
			ms = parseInt(ms);
			document.dispatchEvent(new CustomEvent('rnp-global-offset', { detail: ms }));
			lyricOffsetNumber.innerHTML = `${['-', '', '+'][Math.sign(ms) + 1]}${(Math.abs(ms) / 1000).toFixed(1).replace(/\.0$/, '')}s`;
			if (ms === 0) lyricOffsetTip.innerHTML = '未设置';
			else lyricOffsetTip.innerHTML = (ms > 0 ? '歌词提前' : '歌词滞后');
			if (ms === 0) lyricOffsetReset.classList.remove('active');
			else lyricOffsetReset.classList.add('active');
			shouldSettingMenuReload = true;
			setSetting('lyric-offset', ms);
		}, parseInt(getSetting('lyric-offset', 0)), 'change');

		const setLyricOffsetValue = (ms) => {
			lyricOffsetSlider.value = ms;
			lyricOffsetSlider.dispatchEvent(new Event('input'));
			lyricOffsetSlider.dispatchEvent(new Event('change'));
		};
		lyricOffsetAdd.addEventListener('click', () => {
			setLyricOffsetValue(parseInt(getSetting('lyric-offset', 0)) + 100);
		});
		lyricOffsetSub.addEventListener('click', () => {
			setLyricOffsetValue(parseInt(getSetting('lyric-offset', 0)) - 100);
		});
		lyricOffsetReset.addEventListener('click', () => {
			setLyricOffsetValue(0);
		});

		// 字体
		const customFont = getOptionDom('#custom-font');
		bindCheckboxToClass(customFont, 'rnp-custom-font', false);
		const customFontSectionContainer = getOptionDom('#rnp-custom-font-section');
		const containerRoot = createRoot(customFontSectionContainer);
		containerRoot.render(<FontSettings />);

		// 实验性选项
		const fluidMaxFramerate = getOptionDom('#fluid-max-framerate');
		const fluidBlur = getOptionDom('#fluid-blur');
		const presentationMode = getOptionDom('#presentation-mode');
		bindSliderToFunction(fluidMaxFramerate, (x) => {
			x = parseInt(x);
			const arr = ['5', '10', '30', '60', 'inf'];
			for (let i = 0; i <= 4; i++) {
				document.body.classList.remove(`rnp-fluid-max-framerate-${arr[i]}`);
			}
			document.body.classList.add(`rnp-fluid-max-framerate-${arr[x]}`);
		}, getSetting('fluid-max-framerate', 5), 'change');
		bindSliderToCSSVariable(fluidBlur, '--fluid-blur', 6, 'change', (x) => `${parseInt(Math.pow(2, x))}px`);
		presentationMode.addEventListener("change", e => {
			addOrRemoveGlobalClassByOption('presentation-mode', e.target.checked);
		});

		// 杂项
		const hideSongAliasName = getOptionDom('#hide-song-alias-name');
		bindCheckboxToClass(hideSongAliasName, 'hide-song-alias-name', false);

		// 关于
		const versionNumber = getOptionDom('#rnp-version-number');
		versionNumber.innerHTML = loadedPlugins.RefinedNowPlaying.manifest.version;
		const openWhatsNew = getOptionDom('#open-whats-new');
		openWhatsNew.addEventListener('click', () => {
			whatsNew(true);
		});
	}
	const initTabs = (menu) => {
		const tabs = menu.querySelectorAll('.rnp-settings-menu-tabs .rnp-settings-menu-tab');
		const container = menu.querySelector('.rnp-settings-menu-inner');
		const sections = container.querySelectorAll('.rnp-group');
		let active = container.querySelector('.rnp-group.active')?.dataset?.tab ?? 'appearance';
		const setActive = (name) => {
			if (name === active) return;
			active = name;
			tabs.forEach((x) => {
				if (x.dataset.tab === name) x.classList.add('active');
				else x.classList.remove('active');
			});			
		};
		tabs.forEach((x) => {
			x.addEventListener('click', () => {
				const top = container.querySelector(`.rnp-group[data-tab="${x.dataset.tab}"]`).offsetTop + 5;
				container.scrollTo({ top, behavior: 'smooth' });
			});
		});
		container.addEventListener('scroll', () => {
			const top = container.scrollTop;
			if (top + container.clientHeight >= container.scrollHeight) {
				setActive(sections[sections.length - 1].dataset.tab);
				return;
			}
			let name = active;
			sections.forEach((x) => {
				if (x.offsetTop <= top) name = x.dataset.tab;
			});
			setActive(name);
		});
		menu.querySelector('input.rnp-settings').addEventListener('click', () => {
			container.dispatchEvent(new Event('scroll'));
		});
	};



	const settingsMenu = document.createElement('div');
	settingsMenu.id = 'settings-menu';
	settingsMenu.innerHTML = settingsMenuHTML;

	if (document.querySelector(`#${settingsMenu.id}`)) {
		document.querySelector(`#${settingsMenu.id}`).remove();
	}

	getV3LyricPage()?.appendChild(settingsMenu);
	initSettings();
	initTabs(settingsMenu);
	hijackFailureNoticeCheck();
};

const toggleFullScreen = (force = null) => {
	if (!document.fullscreenElement) {
		if (force === false) return;
		document.documentElement.requestFullscreen();
		if (loadedPlugins['RoundCornerNCM']) {
			betterncm.app.setRoundedCorner(false);
		}
		document.body.classList.add('rnp-full-screen');
		document.querySelector('.rnp-full-screen-button')?.setAttribute('title', '退出全屏');
		
	} else {
		if (document.exitFullscreen) {
			if (force === true) return;
			document.exitFullscreen();
			if (loadedPlugins['RoundCornerNCM']) {
				betterncm.app.setRoundedCorner(true);
			}
			document.body.classList.remove('rnp-full-screen');
			document.querySelector('.rnp-full-screen-button')?.setAttribute('title', '全屏');
		}
	}
	syncRnpWindowControlState();
}

const addFullScreenButton = () => {
	const fullScreenButton = document.createElement('div');
	fullScreenButton.classList.add('rnp-full-screen-button');
	fullScreenButton.title = '全屏';
	fullScreenButton.addEventListener('click', () => toggleFullScreen());
	document.body.appendChild(fullScreenButton); 
	//Full Screen Clock
	const fullScreenClock = document.createElement('div');
	fullScreenClock.classList.add('rnp-full-screen-clock');
	const updateClock = () => {
		const currentTime = new Date();
		const hours = String(currentTime.getHours()).padStart(2, '0');
		const minutes = String(currentTime.getMinutes()).padStart(2, '0');
		fullScreenClock.textContent = `${hours}:${minutes}`;
	};
	updateClock();
	setInterval(updateClock, 1000);
	document.body.appendChild(fullScreenClock);
};

document.addEventListener('fullscreenchange', syncRnpWindowControlState);

new MutationObserver(() => {
	if (!document.body.classList.contains('mq-playing') && document.body.classList.contains('rnp-full-screen')) {
		toggleFullScreen(false);
	}
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// intercept src setter of HTMLImageElement
const _src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', {
	get: function() {
		return _src.get.call(this);
	},
	set: function(src) {
		let element = this;
		if (element.classList.contains('j-flag')) {
			if (!window.albumSize) {
				window.albumSize = 210;
			}
			src = applyAlbumImageSize(src, window.albumSize);
		}
		return _src.set.call(this, src);
	}
});


plugin.onLoad(async (p) => {
	compatibilityWizard();

	document.body.classList.add('refined-now-playing');

	if (!loadedPlugins['MaterialYouTheme']) {
		document.body.classList.add('no-material-you-theme');
	}

	await betterncm.utils.waitForFunction(() => {
		return document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.child?.child?.memoizedProps?.store;
	});
	injectV3LyricPage();
	createV3LyricPage();

	const patchNowPlayingPage = async () => {
		const nowPlayingPage = getV3LyricPage();
		if (!nowPlayingPage || nowPlayingPage.classList.contains('patched')) {
			return;
		}

		nowPlayingPage.classList.add('patched');
			const coverImage = nowPlayingPage.querySelector('.n-single .cdimg img');
			const infoContainer = nowPlayingPage.querySelector('.g-singlec-ct .n-single .mn .head .inf');
			const contentWrap = nowPlayingPage.querySelector('.g-singlec-ct .n-single .wrap');
			const controlsHost = nowPlayingPage.querySelector('.g-singlec-ct .n-single .mn .rnp-v3-controls-host');

			if (!coverImage || !infoContainer || !contentWrap || !controlsHost) {
				nowPlayingPage.classList.remove('patched');
				return;
			}

			coverImage.addEventListener('load', updateCDImage);
			new MutationObserver(updateCDImage).observe(coverImage, { attributes: true, attributeFilter: ['src'] });
			coverImage.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const imageURL = coverImage.src.replace(/^orpheus:\/\/cache\/\?/, '').replace(/\?.*$/, '');
				showContextMenu(e.clientX, e.clientY, [
					{
						label: '复制封面链接',
						callback: () => {
							copyTextToClipboard(imageURL);
						}
					},
					{
						label: '在浏览器中打开封面',
						callback: () => {
							betterncm.app.exec(`${imageURL}`);
						}
					}
				]);
			});

			const addCopySelectionToItems = (items, closetSelector) => {
				const selection = window.getSelection();
				if (selection?.toString?.().trim() && selection.baseNode?.parentElement?.closest?.(closetSelector)) {
					const selectedText = selection.toString().trim();
					items.unshift({
						label: '复制选中文本',
						callback: () => {
							copyTextToClipboard(selectedText);
						}
					});
				}
			};

			infoContainer.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				e.stopPropagation();

				if (e.target.closest('.title .name')) {
					const songName = infoContainer.querySelector('.title .name')?.innerText ?? '';
					const items = [
						{
							label: '复制歌曲名',
							callback: () => {
								copyTextToClipboard(songName);
							}
						}
					];
					addCopySelectionToItems(items, '.title .name');
					showContextMenu(e.clientX, e.clientY, items);
					return;
				}

				if (e.target.closest('.info .alias')) {
					const songAlias = infoContainer.querySelector('.info .alias')?.innerText ?? '';
					const items = [
						{
							label: '复制歌曲别名/译名',
							callback: () => {
								copyTextToClipboard(songAlias);
							}
						}
					];
					addCopySelectionToItems(items, '.info .alias');
					showContextMenu(e.clientX, e.clientY, items);
				}
			});

			const background = document.createElement('div');
			background.classList.add('rnp-bg');
			ReactDOM.render(
				<Background
					type={getSetting('background-type', 'fluid')}
					image={coverImage}
				/>
			, background);
			nowPlayingPage.appendChild(background);

			const coverShadowController = document.createElement('div');
			coverShadowController.classList.add('rnp-cover-shadow-controller');
			ReactDOM.render(<CoverShadow image={coverImage} />, coverShadowController);
			document.body.appendChild(coverShadowController);

			const lyrics = document.createElement('div');
			lyrics.classList.add('lyric');
			ReactDOM.render(<Lyrics />, lyrics);
			contentWrap.appendChild(lyrics);

			const miniSongInfo = document.createElement('div');
			miniSongInfo.classList.add('rnp-mini-song-info');
			ReactDOM.render(
				<MiniSongInfo
					image={coverImage}
					infContainer={infoContainer}
				/>
			, miniSongInfo);
			nowPlayingPage.appendChild(miniSongInfo);

			ReactDOM.render(
				<V3PlayerControls coverFavoriteHost={nowPlayingPage.querySelector('.rnp-cover-favorite-host')} />,
				controlsHost
			);

			addSettingsMenu();
			addFullScreenButton();
			updateCDImage();
			scheduleV3LyricPageInfoUpdate();
			whatsNew();

	};

	syncV3LyricPageState();
	void patchNowPlayingPage();
	document.addEventListener('lyrics-updated', scheduleV3LyricPageInfoUpdate);
	window.addEventListener('rnp-lyric-page-opened', () => {
		syncV3LyricPageState();
		scheduleV3LyricPageInfoUpdate();
		for (let i = 0; i < 6; i++) {
			setTimeout(() => {
				window.dispatchEvent(new Event('recalc-lyrics'));
				recalculateTitleSize(true);
				calcTitleScroll();
			}, 50 * i);
		}
	});
	window.addEventListener('rnp-lyric-page-closed', () => {
		syncV3LyricPageState();
	});

	// Fix incomptibility with light theme
	const lightThemeFixStyle = document.createElement('link');
	lightThemeFixStyle.rel = 'stylesheet';
	document.head.appendChild(lightThemeFixStyle);
	new MutationObserver(() => {
		if (document.body.classList.contains('mq-playing')) {
			if (lightThemeFixStyle.href !== 'orpheus://orpheus/style/res/less/default/css/skin.ls.css') {
				lightThemeFixStyle.href = 'orpheus://orpheus/style/res/less/default/css/skin.ls.css';
			}
		} else {
			if (lightThemeFixStyle.href !== '') {
				lightThemeFixStyle.href = '';
			}
		}
	}).observe(document.body, { attributes: true, attributeFilter: ['class'] });


	let previousHasClass = document.body.classList.contains('mq-playing');
	new MutationObserver(() => {
		const hasClass = document.body.classList.contains('mq-playing');
		if (hasClass !== previousHasClass) {
			previousHasClass = hasClass;
			if (hasClass) {
				for (let i = 0; i < 10; i++) {
					setTimeout(() => {
						window.dispatchEvent(new Event('recalc-lyrics'));
						window.dispatchEvent(new Event('recalc-title'));
					}, 50 * i);
				}
			}
		}
	}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	// Listen system theme change
	const toggleSystemDarkmodeClass = (media) => {
		document.body.classList.add(media.matches ? 'rnp-system-dark' : 'rnp-system-light');
		document.body.classList.remove(media.matches ? 'rnp-system-light' : 'rnp-system-dark');
		if (document.body.classList.contains('rnp-system-dynamic-theme-auto')) {
			window.mdThemeType = media.matches ? 'dark' : 'light';
		}
	};
	const systemDarkmodeMedia = window.matchMedia('(prefers-color-scheme: dark)');
	systemDarkmodeMedia.addEventListener('change', () => { toggleSystemDarkmodeClass(systemDarkmodeMedia); });
	toggleSystemDarkmodeClass(systemDarkmodeMedia);

	// Idle detection
	const IdleThreshold = 1.5 * 1000;
	let idleTimer = null;
	let idle = false;
	let debounceTime = null;
	let debounceTimer = null;
	const resetIdleTimer = () => {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			idle = true;
			document.body.classList.add('rnp-idle');
			if (debounceTimer) clearTimeout(debounceTimer);
		}, IdleThreshold);
	}
	const resetIdle = () => {
		if (idle) {
			idle = false;
			document.body.classList.remove('rnp-idle');
			debounceTime = new Date().getTime();
		}
		resetIdleTimer();
	}
	const setIdle = () => {
		debounceTimer = setTimeout(() => {
			if (idleTimer) clearTimeout(idleTimer);
			idle = true;
			document.body.classList.add('rnp-idle');
		}, Math.max((debounceTime ?? 0) + 325 - new Date().getTime(), 0));
	}
	resetIdleTimer();
	document.addEventListener('mousemove', resetIdle);
	document.addEventListener('mouseout', (e) => {
		if (e.relatedTarget === null) {
			setIdle();
		}
	});
});

plugin.onConfig((tools) => {
	return dom("div", {},
		dom("span", { innerHTML: "打开正在播放界面以调整设置 " , style: { fontSize: "18px" } }),
		tools.makeBtn("打开", async () => {
			createV3LyricPage();
			openRnpLyricPage();
		}),
		dom("div", { innerHTML: "" , style: { height: "20px" } }),
		dom("span", { innerHTML: "进入兼容性检查页面 " , style: { fontSize: "18px" } }),
		tools.makeBtn("兼容性检查", async () => {
			compatibilityWizard(true);
		})
	);
});
