const ROOT_STORE_CANDIDATES = [
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.child?.child?.memoizedProps?.store,
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.child?.memoizedProps?.store,
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.memoizedProps?.store,
	() => document.getElementById('root')?._reactRootContainer?._internalRoot?.current?.memoizedState?.element?.props?.store,
];

const AMLL_PLAYER_BUTTON_SELECTOR = '#btn_pc_minibar_play';
const V3_PLAY_BUTTON_SELECTOR = 'footer > * > * > .middle > *:nth-child(1) > button:nth-child(3)';
const V3_FAVORITE_BUTTON_SELECTOR = 'footer .left button:nth-child(1)';
const V3_PLAY_MODE_BUTTON_SELECTOR = 'footer > * > * > .middle > *:nth-child(1) > button:nth-child(1)';
const LEGACY_FAVORITE_BUTTON_SELECTOR = '.m-pinfo .btn.btn-love';
const PAUSE_TEXT_PATTERN = /pause|\u6682\u505c/;
const TRANSPORT_LABEL_PATTERNS = {
	previous: /previous|prev|rewind|back|last|\u4e0a\u4e00\u9996|\u4e0a\u4e00\u66f2|\u4e0a\u9996|\u4e0a\u66f2/,
	next: /next|forward|\u4e0b\u4e00\u9996|\u4e0b\u4e00\u66f2|\u4e0b\u9996|\u4e0b\u66f2/,
	play: /play|pause|\u64ad\u653e|\u6682\u505c/,
};
const PLAY_MODE_LABEL_PATTERN = /play.?mode|playback.?mode|shuffle|random|order|repeat|loop|singleloop|single|cycle|\u64ad\u653e\u6a21\u5f0f|\u5fc3\u52a8\u6a21\u5f0f|\u968f\u673a|\u987a\u5e8f|\u5faa\u73af|\u5355\u66f2|\u5217\u8868\u5faa\u73af/;
const PLAY_MODE_EXCLUDE_PATTERN = /playlist|queue|\u64ad\u653e\u5217\u8868|\u64ad\u653e\u961f\u5217|\u6b4c\u66f2\u5217\u8868|\u6b4c\u5355/;
const PLAYLIST_LABEL_PATTERN = /playlist|queue|\u64ad\u653e\u5217\u8868|\u64ad\u653e\u961f\u5217/;
export const PLAY_MODES = {
	ORDER: 'type-order',
	REPEAT: 'type-repeat',
	AI: 'type-ai',
	ONE: 'type-one',
	RANDOM: 'type-random',
};
export const AUDIO_QUALITY_TYPES = {
	NORMAL: 'normal',
	HIGH: 'high',
	LOSSLESS: 'lossless',
	HIRES: 'hires',
	DOLBY_ATMOS: 'dolbyatmos',
	LOCAL: 'local',
};

const normalizeString = (value) => String(value ?? '').trim();
const normalizeClassName = (value) => {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value?.baseVal === 'string') {
		return value.baseVal;
	}
	return normalizeString(value);
};
const registeredEvents = new Set();
const registeredCallbacks = new Map();

export const getNCMStore = () => {
	for (const getStore of ROOT_STORE_CANDIDATES) {
		try {
			const store = getStore();
			if (store?.getState && store?.subscribe) {
				return store;
			}
		} catch (error) {
			console.debug('Failed to resolve NCM store candidate', error);
		}
	}
	return null;
};

export const dispatchNCMAction = (action) => {
	const store = getNCMStore();
	if (typeof store?.dispatch !== 'function') {
		return false;
	}

	try {
		store.dispatch(action);
		return true;
	} catch (error) {
		console.warn('Failed to dispatch NCM action', action, error);
		return false;
	}
};

export const jumpToAdjacentTrack = (flag) => dispatchNCMAction({
	type: 'playingList/jump2Track',
	payload: {
		flag,
		type: 'call',
		triggerScene: 'miniBar',
	},
});

export const getPlayingState = () => {
	const state = getNCMStore()?.getState?.();
	return state?.playing ?? null;
};

export const getPlayingSong = () => {
	const playingState = getPlayingState();
	if (playingState) {
		return playingState;
	}

	return null;
};

export const getCurrentAudioQuality = () => {
	const playingSong = getPlayingSong();
	const bitrate = Number(playingSong?.resourcePlayingQuality);
	const envSound = normalizeString(playingSong?.resourcePlayingEnvSound).toLowerCase();
	const trackFileType = normalizeString(playingSong?.trackFileType).toLowerCase();

	if (envSound === 'dolby') {
		return AUDIO_QUALITY_TYPES.DOLBY_ATMOS;
	}
	if (trackFileType === 'local') {
		return AUDIO_QUALITY_TYPES.LOCAL;
	}
	if (!Number.isFinite(bitrate)) {
		return AUDIO_QUALITY_TYPES.LOCAL;
	}
	if (bitrate <= 192) {
		return AUDIO_QUALITY_TYPES.NORMAL;
	}
	if (bitrate <= 320) {
		return AUDIO_QUALITY_TYPES.HIGH;
	}
	if (bitrate <= 999) {
		return AUDIO_QUALITY_TYPES.LOSSLESS;
	}
	if (bitrate <= 1999) {
		return AUDIO_QUALITY_TYPES.HIRES;
	}
	return AUDIO_QUALITY_TYPES.HIRES;
};

export const getPlayingSongId = () => {
	const playingSong = getPlayingSong();
	const candidates = [
		playingSong?.resourceTrackId,
		playingSong?.originFromTrack?.lrcid,
		playingSong?.originFromTrack?.track?.tid,
		playingSong?.curTrack?.id,
		playingSong?.id,
		playingSong?.data?.id,
	];

	for (const candidate of candidates) {
		const normalized = normalizeString(candidate);
		if (normalized) {
			return normalized;
		}
	}

	return '';
};

export const getLyricApiUrl = (songId) => {
	const normalizedSongId = normalizeString(songId);
	if (!normalizedSongId) {
		return '';
	}

	return `${window?.APP_CONF?.domain ?? 'https://music.163.com'}/api/song/lyric/v1?tv=0&lv=0&rv=0&kv=0&yv=0&ytv=0&yrv=0&cp=false&id=${normalizedSongId}`;
};

export const fetchLyricsBySongId = async (songId, { signal } = {}) => {
	const lyricApiUrl = getLyricApiUrl(songId);
	if (!lyricApiUrl) {
		return null;
	}

	const response = await fetch(lyricApiUrl, { signal });
	if (!response.ok) {
		throw new Error(`Failed to fetch lyrics: ${response.status} ${response.statusText}`);
	}

	return response.json();
};

const getDirectPlayerButton = () => (
	document.querySelector(AMLL_PLAYER_BUTTON_SELECTOR)
	|| document.querySelector(V3_PLAY_BUTTON_SELECTOR)
);

export const getPlayerButton = () => (
	findPlayButtonInButtons(sortButtonsByPosition(getFooterButtons()))
	|| getDirectPlayerButton()
);

export const getPlayingPlayerButton = () => (
	document.querySelector(`${AMLL_PLAYER_BUTTON_SELECTOR}.play-pause-btn`)
);

export const getPausedPlayerButton = () => (
	document.querySelector(`${AMLL_PLAYER_BUTTON_SELECTOR}:not(.play-pause-btn)`)
);

export const getIsPlayingFromPlayStateEvent = (stateId) => {
	const state = normalizeString(stateId).toLowerCase().split('|').pop();
	if (state === 'pause') {
		return false;
	}
	if (state === 'resume') {
		return true;
	}
	return null;
};

export const isPlayerButtonPlaying = (button = getPlayerButton()) => {
	if (!button) {
		return false;
	}

	const stateText = [
		button.getAttribute('aria-label'),
		button.getAttribute('title'),
		button.textContent,
	].join(' ').toLowerCase();
	return (
		button.classList?.contains('btnp-pause') ||
		button.classList?.contains('play-pause-btn') ||
		PAUSE_TEXT_PATTERN.test(stateText)
	);
};

export const isPlayerPlaying = () => isPlayerButtonPlaying(getPlayerButton());

const getElementDescriptor = (element) => {
	if (!element) {
		return '';
	}

	const parts = [
		element.getAttribute?.('aria-label'),
		element.getAttribute?.('title'),
		element.getAttribute?.('aria-pressed'),
		element.getAttribute?.('data-state'),
		element.getAttribute?.('data-active'),
		element.getAttribute?.('data-checked'),
		element.getAttribute?.('data-testid'),
		element.getAttribute?.('data-action'),
		normalizeClassName(element.className),
		element.textContent,
	];

	const childDescriptors = Array.from(
		element.querySelectorAll?.('[aria-label], [title], [aria-pressed], [data-state], [data-active], [data-checked], [data-testid], [data-action], [class]') ?? []
	).flatMap((child) => [
		child.getAttribute?.('aria-label'),
		child.getAttribute?.('title'),
		child.getAttribute?.('aria-pressed'),
		child.getAttribute?.('data-state'),
		child.getAttribute?.('data-active'),
		child.getAttribute?.('data-checked'),
		child.getAttribute?.('data-testid'),
		child.getAttribute?.('data-action'),
		normalizeClassName(child.className),
	]);

	return [...parts, ...childDescriptors].join(' ').toLowerCase();
};

const isPlayModeButton = (button) => {
	const descriptor = getElementDescriptor(button);
	return PLAY_MODE_LABEL_PATTERN.test(descriptor) && !PLAY_MODE_EXCLUDE_PATTERN.test(descriptor);
};

const isPlaylistButton = (button) => {
	const descriptor = getElementDescriptor(button);
	return PLAYLIST_LABEL_PATTERN.test(descriptor);
};

const getPlayModeFromDescriptor = (descriptor) => {
	const normalizedDescriptor = normalizeString(descriptor).toLowerCase();
	if (!normalizedDescriptor) {
		return null;
	}

	if (/heart.?mode|intelligence|\bai\b|\u5fc3\u52a8\u6a21\u5f0f/.test(normalizedDescriptor)) {
		return PLAY_MODES.AI;
	}
	if (/single.?loop|single.?repeat|repeat.?one|\u5355\u66f2\u5faa\u73af/.test(normalizedDescriptor)) {
		return PLAY_MODES.ONE;
	}
	if (/shuffle|random|\u968f\u673a\u64ad\u653e|\u968f\u673a/.test(normalizedDescriptor)) {
		return PLAY_MODES.RANDOM;
	}
	if (/order|sequence|\u987a\u5e8f\u64ad\u653e|\u987a\u5e8f/.test(normalizedDescriptor)) {
		return PLAY_MODES.ORDER;
	}
	if (/list.?loop|list.?repeat|repeat|loop|\u5217\u8868\u5faa\u73af|\u5faa\u73af\u64ad\u653e|\u5faa\u73af/.test(normalizedDescriptor)) {
		return PLAY_MODES.REPEAT;
	}

	return null;
};

const hasTransportLabel = (button, action) => (
	TRANSPORT_LABEL_PATTERNS[action]?.test(getElementDescriptor(button))
);

const isLikelyPlayButton = (button) => (
	button?.matches?.(AMLL_PLAYER_BUTTON_SELECTOR)
	|| button?.matches?.(V3_PLAY_BUTTON_SELECTOR)
	|| isPlayerButtonPlaying(button)
);

const findPlayButtonInButtons = (buttons) => (
	buttons.find(isLikelyPlayButton)
	|| buttons.find((button) => (
		hasTransportLabel(button, 'play')
		&& !isPlayModeButton(button)
		&& !PLAY_MODE_EXCLUDE_PATTERN.test(getElementDescriptor(button))
	))
	|| null
);

const isInferredPlayModeCandidate = (button) => {
	if (!button || button.disabled) {
		return false;
	}

	const descriptor = getElementDescriptor(button);
	return (
		!PLAY_MODE_EXCLUDE_PATTERN.test(descriptor)
		&& !isLikelyPlayButton(button)
		&& !hasTransportLabel(button, 'previous')
		&& !hasTransportLabel(button, 'next')
	);
};

const isInferredPlaylistCandidate = (button) => {
	if (!button || button.disabled) {
		return false;
	}

	return (
		!isPlayModeButton(button)
		&& !isLikelyPlayButton(button)
		&& !hasTransportLabel(button, 'previous')
		&& !hasTransportLabel(button, 'next')
	);
};

const getFooterButtons = () => Array.from(document.querySelectorAll('footer .middle button'))
	.filter((button) => !button.disabled);

const sortButtonsByPosition = (buttons) => [...buttons].sort((first, second) => {
	const firstRect = first.getBoundingClientRect?.() ?? { left: 0, top: 0 };
	const secondRect = second.getBoundingClientRect?.() ?? { left: 0, top: 0 };
	if (Math.abs(firstRect.top - secondRect.top) > 4) {
		return firstRect.top - secondRect.top;
	}
	if (firstRect.left !== secondRect.left) {
		return firstRect.left - secondRect.left;
	}
	return 0;
});

const findButtonByActionLabel = (buttons, action) => {
	const pattern = TRANSPORT_LABEL_PATTERNS[action];
	return buttons.find((button) => pattern?.test(getElementDescriptor(button))) ?? null;
};

const findButtonGroupAround = (button) => {
	if (!button) {
		return [];
	}

	for (let node = button.parentElement; node && node !== document.body; node = node.parentElement) {
		const buttons = sortButtonsByPosition(Array.from(node.querySelectorAll('button')).filter((candidate) => !candidate.disabled));
		if (buttons.length >= 3 && buttons.includes(button)) {
			return buttons;
		}
	}

	return [];
};

const findFooterTransportGroup = () => {
	const footerButtons = sortButtonsByPosition(getFooterButtons());
	const playButton = findPlayButtonInButtons(footerButtons);

	if (playButton) {
		const group = findButtonGroupAround(playButton);
		return group.length > 0 ? group : footerButtons;
	}

	return footerButtons;
};

const findAdjacentTransportButton = (action) => {
	const footerGroup = findFooterTransportGroup();
	if (footerGroup.length < 3) {
		return null;
	}

	const playButton = findPlayButtonInButtons(footerGroup);
	const playIndex = footerGroup.indexOf(playButton);
	if (playIndex < 0) {
		return null;
	}

	return action === 'previous'
		? footerGroup[playIndex - 1] ?? null
		: footerGroup[playIndex + 1] ?? null;
};

const findInferredPlayModeButton = () => {
	const footerGroup = sortButtonsByPosition(getFooterButtons());
	const playButton = findPlayButtonInButtons(footerGroup);
	const playIndex = footerGroup.indexOf(playButton);
	if (playIndex < 0) {
		return null;
	}

	const previousButton = findButtonByActionLabel(footerGroup, 'previous') ?? footerGroup[playIndex - 1] ?? null;
	const previousIndex = footerGroup.indexOf(previousButton);
	const candidates = [
		footerGroup[previousIndex - 1],
		footerGroup[playIndex - 2],
		footerGroup[0],
	].filter(Boolean);

	return candidates.find(isInferredPlayModeCandidate) ?? null;
};

const findInferredPlaylistButton = () => {
	const footerGroup = sortButtonsByPosition(getFooterButtons());
	const playButton = findPlayButtonInButtons(footerGroup);
	const playIndex = footerGroup.indexOf(playButton);
	if (playIndex < 0) {
		return null;
	}

	const nextButton = findButtonByActionLabel(footerGroup, 'next') ?? footerGroup[playIndex + 1] ?? null;
	const nextIndex = footerGroup.indexOf(nextButton);
	const candidates = [
		footerGroup[nextIndex + 1],
		footerGroup[playIndex + 2],
		footerGroup[footerGroup.length - 1],
	].filter(Boolean);

	return candidates.find(isInferredPlaylistCandidate) ?? null;
};

export const getTransportButton = (action) => {
	const playerGroup = findButtonGroupAround(getPlayerButton());
	const searchGroups = [
		playerGroup,
		getFooterButtons(),
	].filter((buttons) => buttons.length > 0);

	for (const buttons of searchGroups) {
		const labelledButton = action === 'play'
			? findPlayButtonInButtons(buttons)
			: findButtonByActionLabel(buttons, action);
		if (labelledButton) {
			return labelledButton;
		}
	}

	if (action === 'play') {
		return getPlayerButton();
	}

	return findAdjacentTransportButton(action);
};

export const getFavoriteButton = () => (
	document.querySelector(V3_FAVORITE_BUTTON_SELECTOR)
	|| document.querySelector(LEGACY_FAVORITE_BUTTON_SELECTOR)
);

export const getPlayModeButton = () => {
	const exactButton = document.querySelector(V3_PLAY_MODE_BUTTON_SELECTOR);
	if (exactButton && isPlayModeButton(exactButton)) {
		return exactButton;
	}

	return findInferredPlayModeButton()
		?? getFooterButtons().find(isPlayModeButton)
		?? null;
};

export const getPlaylistButton = () => (
	findInferredPlaylistButton()
	?? getFooterButtons().find(isPlaylistButton)
	?? null
);

export const getCurrentPlayMode = () => {
	const modeFromButton = getPlayModeFromDescriptor(getElementDescriptor(getPlayModeButton()));
	if (modeFromButton) {
		return modeFromButton;
	}

	try {
		const setting = JSON.parse(localStorage.getItem('NM_SETTING_PLAYER') || '{}');
		if (setting?.mode2) {
			return PLAY_MODES.AI;
		}

		switch (normalizeString(setting?.mode).toLowerCase()) {
			case 'playonce':
			case 'once':
			case 'sequence':
				return PLAY_MODES.ORDER;
			case 'playorder':
			case 'order':
			case 'loop':
			case 'repeat':
			case 'listloop':
				return PLAY_MODES.REPEAT;
			case 'playcycle':
			case 'singleloop':
			case 'single':
			case 'one':
			case 'repeatone':
				return PLAY_MODES.ONE;
			case 'playrandom':
			case 'random':
			case 'shuffle':
				return PLAY_MODES.RANDOM;
			default:
				break;
		}
	} catch (error) {
		console.debug('Failed to read NM_SETTING_PLAYER.mode', error);
	}

	return PLAY_MODES.ONE;
};

const getButtonBooleanState = (button) => {
	for (const element of [button, ...Array.from(button?.querySelectorAll?.('*') ?? [])]) {
		const pressed = normalizeString(
			element?.getAttribute?.('aria-pressed')
			?? element?.getAttribute?.('data-active')
			?? element?.getAttribute?.('data-checked')
		).toLowerCase();
		if (['true', 'checked', 'selected', 'active', 'on'].includes(pressed)) {
			return true;
		}
		if (['false', 'unchecked', 'unselected', 'inactive', 'off'].includes(pressed)) {
			return false;
		}
	}
	return null;
};

export const isCurrentSongLiked = () => {
	const legacyButton = document.querySelector(LEGACY_FAVORITE_BUTTON_SELECTOR);
	if (legacyButton?.classList?.contains('loved')) {
		return true;
	}

	const favoriteButton = getFavoriteButton();
	const booleanState = getButtonBooleanState(favoriteButton);
	if (booleanState !== null) {
		return booleanState;
	}
	const descriptor = getElementDescriptor(favoriteButton);
	if (/\b(loved|liked|selected|checked)\b|z-sel/.test(descriptor)) {
		return true;
	}

	const stateText = [
		favoriteButton?.querySelector?.('span > span')?.getAttribute?.('title'),
		favoriteButton?.querySelector?.('span > span')?.getAttribute?.('aria-label'),
		favoriteButton?.getAttribute?.('aria-label'),
		favoriteButton?.getAttribute?.('title'),
		favoriteButton?.textContent,
	].join(' ').trim();
	const normalizedStateText = stateText.toLowerCase();

	if (/unlike|liked|loved|remove\s+(from\s+)?favou?rite/.test(normalizedStateText) || /\u53d6\u6d88.*(\u559c\u6b22|\u6536\u85cf)/.test(stateText)) {
		return true;
	}
	if (/like|favou?rite/.test(normalizedStateText) || stateText.trim().startsWith('\u559c\u6b22') || stateText.trim().startsWith('\u6536\u85cf')) {
		return false;
	}

	return false;
};

const dispatchRegisteredEvent = (eventName, args) => {
	for (const callback of registeredCallbacks.get(eventName) ?? []) {
		try {
			callback(...args);
		} catch (error) {
			console.warn(`Failed to handle ${eventName}`, error);
		}
	}
};

export const appendRegisterCall = (name, namespace, callback) => {
	if (typeof channel === 'undefined' || typeof channel.registerCall !== 'function') {
		return callback;
	}

	const eventName = `${namespace}.on${name}`;
	if (!registeredEvents.has(eventName)) {
		registeredEvents.add(eventName);
		channel.registerCall(eventName, (...args) => {
			dispatchRegisteredEvent(eventName, args);
		});
	}

	if (!registeredCallbacks.has(eventName)) {
		registeredCallbacks.set(eventName, new Set());
	}
	registeredCallbacks.get(eventName).add(callback);
	return callback;
};

export const removeRegisterCall = (name, namespace, callback) => {
	if (typeof channel === 'undefined' || typeof channel.registerCall !== 'function') {
		return;
	}

	const eventName = `${namespace}.on${name}`;
	if (!registeredCallbacks.has(eventName)) {
		return;
	}

	registeredCallbacks.get(eventName).delete(callback);
	if (registeredCallbacks.get(eventName).size === 0) {
		registeredCallbacks.delete(eventName);
	}
};
