const useEffect = React.useEffect;
const useMemo = React.useMemo;
const useRef = React.useRef;
const useState = React.useState;

const normalizeNumber = (value) => {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function V3Slider(props) {
	const {
		className = '',
		value,
		min,
		max,
		step = 0,
		beforeIcon = null,
		afterIcon = null,
		onBeforeChange,
		onChange,
		onAfterChange,
		trackRef = null,
	} = props;

	const outerRef = useRef(null);
	const innerRef = useRef(null);
	const draggingRef = useRef(false);
	const dragCleanupRef = useRef(null);
	const [isHovered, setIsHovered] = useState(false);
	const [isDragging, setIsDragging] = useState(false);

	const range = useMemo(() => {
		const normalizedMin = normalizeNumber(min);
		const normalizedMax = normalizeNumber(max);
		return Math.max(normalizedMax - normalizedMin, 0);
	}, [max, min]);

	const normalizedValue = useMemo(() => {
		if (range <= 0) {
			return normalizeNumber(min);
		}
		return clamp(normalizeNumber(value), normalizeNumber(min), normalizeNumber(max));
	}, [max, min, range, value]);

	const percent = useMemo(() => {
		if (range <= 0) {
			return 0;
		}
		return (normalizedValue - normalizeNumber(min)) / range * 100;
	}, [min, normalizedValue, range]);

	const applyStep = (nextValue) => {
		const normalizedMin = normalizeNumber(min);
		const normalizedMax = normalizeNumber(max);
		const normalizedStep = normalizeNumber(step);
		let resolvedValue = clamp(nextValue, normalizedMin, normalizedMax);

		if (normalizedStep > 0) {
			resolvedValue = normalizedMin + Math.round((resolvedValue - normalizedMin) / normalizedStep) * normalizedStep;
		}

		return clamp(resolvedValue, normalizedMin, normalizedMax);
	};

	const resolveValueFromClientX = (clientX) => {
		const track = innerRef.current;
		if (!track) {
			return normalizedValue;
		}

		const rect = track.getBoundingClientRect();
		if (!rect.width) {
			return normalizedValue;
		}

		const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
		return applyStep(normalizeNumber(min) + ratio * range);
	};

	useEffect(() => {
		return () => {
			dragCleanupRef.current?.();
			dragCleanupRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (typeof trackRef === 'function') {
			trackRef(innerRef.current);
			return () => trackRef(null);
		}

		if (trackRef && typeof trackRef === 'object') {
			trackRef.current = innerRef.current;
			return () => {
				if (trackRef.current === innerRef.current) {
					trackRef.current = null;
				}
			};
		}

		return undefined;
	}, [trackRef]);
	const handlePointerDown = (event) => {
		event.preventDefault();
		event.stopPropagation();

		const nextValue = resolveValueFromClientX(event.clientX);
		dragCleanupRef.current?.();
		draggingRef.current = true;
		setIsDragging(true);
		onBeforeChange?.();
		onChange?.(nextValue);

		const handlePointerMove = (moveEvent) => {
			if (!draggingRef.current) {
				return;
			}

			onChange?.(resolveValueFromClientX(moveEvent.clientX));
		};

		const handlePointerUp = (upEvent) => {
			if (!draggingRef.current) {
				return;
			}

			draggingRef.current = false;
			setIsDragging(false);
			const resolvedValue = resolveValueFromClientX(upEvent.clientX);
			onChange?.(resolvedValue);
			onAfterChange?.(resolvedValue);
			dragCleanupRef.current?.();
			dragCleanupRef.current = null;
		};

		const cleanup = () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointercancel', handlePointerUp);
		};

		dragCleanupRef.current = cleanup;
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerUp);
	};

	return (
		<div
			ref={outerRef}
			className={`appkit-now-playing-slider ${className} ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''}`.trim()}
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
		>
			{beforeIcon ? <span className="appkit-now-playing-slider-icon">{beforeIcon}</span> : null}
			<div
				ref={innerRef}
				className="inner"
				onPointerDown={handlePointerDown}
			>
				<div
					className="thumb"
					style={{
						width: `${percent}%`,
					}}
				/>
			</div>
			{afterIcon ? <span className="appkit-now-playing-slider-icon">{afterIcon}</span> : null}
		</div>
	);
}
