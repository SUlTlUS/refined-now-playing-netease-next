import './progressbar-preview.scss';
import { getSetting } from './utils.js';
import { appendRegisterCall, removeRegisterCall } from './ncm-compat.js';

if (getSetting('enable-progressbar-preview', true)) {
	document.body.classList.add('enable-progressbar-preview');
}

const useState = React.useState;
const useEffect = React.useEffect;
const useRef = React.useRef;
const createPortal = (
	typeof ReactDOM !== 'undefined' && typeof ReactDOM.createPortal === 'function'
		? ReactDOM.createPortal
		: null
);

function useRefState(initialValue) {
	const [value, setValue] = useState(initialValue);
	const valueRef = useRef(value);

	const updateValue = (nextValue) => {
		valueRef.current = nextValue;
		setValue(nextValue);
	};

	return [valueRef, value, updateValue];
}

let totalLengthInit = 0;
appendRegisterCall('Load', 'audioplayer', (_, info) => {
	totalLengthInit = info.duration * 1000;
});

function formatTime(time) {
	const hours = Math.floor(time / 3600);
	const minutes = Math.floor((time - hours * 3600) / 60);
	const seconds = Math.floor(time - hours * 3600 - minutes * 60);
	return `${hours ? `${hours}:` : ''}${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
}

export function ProgressbarPreview(props) {
	const [visible, setVisible] = useState(false);
	const xRef = useRef(0);
	const yRef = useRef(0);

	const progressBarRef = useRef(null);
	useEffect(() => {
		progressBarRef.current = props.dom ?? null;
	}, [props.dom]);

	const [_lyrics, lyrics, setLyrics] = useRefState(null);
	const [nonInterludeCount, setNonInterludeCount] = useState(0);
	const [currentLine, setCurrentLine] = useState(0);
	const [currentNonInterludeIndex, setCurrentNonInterludeIndex] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [_totalLength, totalLength, setTotalLength] = useRefState(totalLengthInit);

	const containerRef = useRef(null);
	const subprogressbarInnerRef = useRef(null);

	const syncLyricsState = (detail = window.currentLyrics) => {
		const nextLyrics = Array.isArray(detail?.lyrics) ? detail.lyrics : null;
		setLyrics(nextLyrics);
		setNonInterludeCount(nextLyrics?.filter((line) => line.originalLyric).length ?? 0);
	};

	useEffect(() => {
		const onLyricsUpdate = (event) => {
			syncLyricsState(event.detail);
		};

		syncLyricsState();
		document.addEventListener('lyrics-updated', onLyricsUpdate);
		return () => {
			document.removeEventListener('lyrics-updated', onLyricsUpdate);
		};
	}, []);

	useEffect(() => {
		const onLoad = (_, info) => {
			setTotalLength(info.duration * 1000);
		};

		appendRegisterCall('Load', 'audioplayer', onLoad);
		return () => {
			removeRegisterCall('Load', 'audioplayer', onLoad);
		};
	}, []);

	const updateHoverPercent = () => {
		if (!progressBarRef.current) {
			return;
		}

		const rect = progressBarRef.current.getBoundingClientRect();
		if (!rect.width) {
			return;
		}

		const percent = Math.max(0, Math.min(1, (xRef.current - rect.left) / rect.width));
		const hoveredTime = _totalLength.current * percent;
		setCurrentTime(hoveredTime);

		if (!_lyrics.current?.length) {
			return;
		}

		let hoveredLineIndex = 0;
		let currentNonInterludeLine = 0;
		for (let index = 0; index < _lyrics.current.length; index += 1) {
			if (_lyrics.current[index].time <= hoveredTime) {
				hoveredLineIndex = index;
				if (_lyrics.current[index].originalLyric) {
					currentNonInterludeLine += 1;
				}
			} else {
				break;
			}
		}

		if (
			hoveredLineIndex === _lyrics.current.length - 1 &&
			_lyrics.current[hoveredLineIndex].duration &&
			hoveredTime > _lyrics.current[hoveredLineIndex].time + _lyrics.current[hoveredLineIndex].duration + 500
		) {
			hoveredLineIndex = _lyrics.current.length;
		}

		setCurrentLine(hoveredLineIndex);
		setCurrentNonInterludeIndex(Math.max(currentNonInterludeLine, 1));

		if (!subprogressbarInnerRef.current) {
			return;
		}

		const hoveredLine = _lyrics.current[hoveredLineIndex];
		if (!hoveredLine) {
			subprogressbarInnerRef.current.style.width = '0%';
			return;
		}

		let duration = hoveredLine.duration;
		if (duration === 0) {
			duration = _totalLength.current - hoveredLine.time;
		}
		duration = Math.max(duration || 0, 1);
		const subProgress = Math.max(0, Math.min(100, (hoveredTime - hoveredLine.time) / duration * 100));
		subprogressbarInnerRef.current.style.width = `${subProgress}%`;
	};

	const updatePosition = () => {
		if (!containerRef.current || !progressBarRef.current) {
			return;
		}

		const width = containerRef.current.clientWidth;
		const height = containerRef.current.clientHeight;
		const rect = progressBarRef.current.getBoundingClientRect();

		let left = xRef.current - width / 2;
		if (left < 0) {
			left = 0;
		}
		if (left + width > window.innerWidth) {
			left = window.innerWidth - width;
		}

		containerRef.current.style.left = `${left}px`;
		containerRef.current.style.top = `${rect.top - height - 5}px`;
	};

	useEffect(() => {
		updatePosition();
	}, [visible, currentLine]);

	const handlePointerEnter = (event) => {
		syncLyricsState();
		setVisible(true);
		xRef.current = event.clientX;
		yRef.current = event.clientY;
		updateHoverPercent();
		updatePosition();
	};

	const handlePointerLeave = () => {
		setVisible(false);
	};

	const handlePointerMove = (event) => {
		xRef.current = event.clientX;
		yRef.current = event.clientY;
		updateHoverPercent();
		updatePosition();
	};

	useEffect(() => {
		const progressBar = progressBarRef.current;
		if (!progressBar) {
			return;
		}

		const addEvent = (name, handler) => {
			progressBar.addEventListener(name, handler);
		};
		const removeEvent = (name, handler) => {
			progressBar.removeEventListener(name, handler);
		};

		addEvent('mouseenter', handlePointerEnter);
		addEvent('mouseleave', handlePointerLeave);
		addEvent('mousemove', handlePointerMove);
		addEvent('pointerenter', handlePointerEnter);
		addEvent('pointerleave', handlePointerLeave);
		addEvent('pointermove', handlePointerMove);

		return () => {
			removeEvent('mouseenter', handlePointerEnter);
			removeEvent('mouseleave', handlePointerLeave);
			removeEvent('mousemove', handlePointerMove);
			removeEvent('pointerenter', handlePointerEnter);
			removeEvent('pointerleave', handlePointerLeave);
			removeEvent('pointermove', handlePointerMove);
		};
	}, [props.dom]);

	const isPureMusic = lyrics && (
		lyrics.length === 1 ||
		(lyrics.length <= 10 && lyrics.some((line) => /纯音乐|instrumental/i.test(line.originalLyric ?? ''))) ||
		lyrics[0]?.unsynced
	);

	const preview = (
		<div
			ref={containerRef}
			className={`progressbar-preview ${(visible && !isPureMusic) ? '' : 'invisible'}`}
		>
			{lyrics && lyrics[currentLine]?.originalLyric ? (
				<div className="progressbar-preview-number">{currentNonInterludeIndex} / {nonInterludeCount}</div>
			) : null}
			{lyrics && lyrics[currentLine]?.dynamicLyric ? (
				<div className="progressbar-preview-line-karaoke">
					{lyrics[currentLine].dynamicLyric.map((word, index) => {
						const wordAbsoluteTime = (lyrics[currentLine].dynamicLyricTime ?? lyrics[currentLine].time ?? 0) + (word.time ?? 0);
						const wordDuration = Math.max(word.duration ?? 0, 1);
						const percent = (currentTime - wordAbsoluteTime) / wordDuration;
						return (
							<span
								key={index}
								className={`progressbar-preview-line-karaoke-word ${percent >= 0 && percent <= 1 ? 'current' : ''} ${percent < 0 ? 'upcoming' : ''}`}
								style={{
									'-webkit-mask-position': `${100 * (1 - Math.max(0, Math.min(1, (currentTime - wordAbsoluteTime) / wordDuration)))}%`,
								}}
							>
								{word.word}
							</span>
						);
					})}
				</div>
			) : null}
			{lyrics && !lyrics[currentLine]?.dynamicLyric && lyrics[currentLine]?.originalLyric ? (
				<div className="progressbar-preview-line-original">{lyrics[currentLine]?.originalLyric}</div>
			) : null}
			{lyrics && lyrics[currentLine]?.originalLyric === '' ? (
				<div className="progressbar-preview-line-original">-</div>
			) : null}
			{lyrics && lyrics[currentLine]?.translatedLyric ? (
				<div className="progressbar-preview-line-translated">{lyrics[currentLine]?.translatedLyric}</div>
			) : null}
			{lyrics && lyrics[currentLine] ? (
				<div className="progressbar-preview-subprogressbar">
					<div className="progressbar-preview-subprogressbar-inner" ref={subprogressbarInnerRef}></div>
				</div>
			) : null}
			{lyrics && lyrics[currentLine] ? (
				<div className="progressbar-preview-line-time">
					<div>{formatTime(lyrics[currentLine]?.time / 1000)}</div>
					<div>{lyrics[currentLine]?.duration > 0 ? formatTime((lyrics[currentLine]?.time + lyrics[currentLine]?.duration) / 1000) : formatTime(totalLength / 1000)}</div>
				</div>
			) : null}
		</div>
	);

	if (createPortal && document.body) {
		return createPortal(preview, document.body);
	}

	return preview;
}
