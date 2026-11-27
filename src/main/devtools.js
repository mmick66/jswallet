import { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { downloadChromeExtension } from 'electron-devtools-installer/dist/downloadChromeExtension';

// electron-devtools-installer 4.0.0's default installExtension calls session.getAllExtensions,
// loadExtension and removeExtension, which Electron deprecated for session.extensions.*. Its
// downloader makes no session calls, so use it alone and load the extension through
// session.extensions. Go back to the default installExtension once a release after 4.0.0
// includes upstream's f8ec609 ("fix: use session.extensions when available").
const installReactDevTools = async (session, { download = downloadChromeExtension } = {}) => {
    const { extensions } = session;
    const installed = extensions.getAllExtensions().find((extension) => extension.id === REACT_DEVELOPER_TOOLS.id);
    if (installed) {
        return installed;
    }
    const folder = await download(REACT_DEVELOPER_TOOLS.id);
    return extensions.loadExtension(folder);
};

export default installReactDevTools;
