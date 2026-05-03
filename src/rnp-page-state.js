const useEffect = React.useEffect;
const useState = React.useState;

const RNP_PAGE_OPEN_CLASS = 'rnp-lyric-page-open';

export const isRnpLyricPageOpen = () => document.body.classList.contains(RNP_PAGE_OPEN_CLASS);

export const useRnpLyricPageOpen = () => {
	const [pageOpen, setPageOpen] = useState(isRnpLyricPageOpen);

	useEffect(() => {
		const syncPageOpen = () => {
			setPageOpen(isRnpLyricPageOpen());
		};
		window.addEventListener('rnp-lyric-page-opened', syncPageOpen);
		window.addEventListener('rnp-lyric-page-closed', syncPageOpen);
		syncPageOpen();
		return () => {
			window.removeEventListener('rnp-lyric-page-opened', syncPageOpen);
			window.removeEventListener('rnp-lyric-page-closed', syncPageOpen);
		};
	}, []);

	return pageOpen;
};
