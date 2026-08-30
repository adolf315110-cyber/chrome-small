# Privacy

Codex Browser Companion is designed to be local-first.

## Data the extension can access

The extension requests temporary access to the active tab only after an explicit user action, such as clicking the extension button, choosing the selection context-menu item, or using the keyboard shortcut. It can read:

- the current page title and URL;
- visible body text;
- the current text selection;
- visible headings and links, when enabled;
- the page description and canonical URL.

It does not read form input values, browser history, cookies, downloads, or other tabs in the background.

## Storage and transmission

- Preferences are stored with `chrome.storage.sync` so Chrome can sync them for the signed-in browser profile.
- A pending context-menu selection is held briefly in `chrome.storage.session` and removed when the panel consumes it.
- Captured page snapshots are held in side-panel memory.
- The extension contains no analytics, advertising, telemetry, remote scripts, or data-upload endpoint.
- Data leaves the extension only when the user copies, downloads, or manually pastes it elsewhere.

Automatic redaction is enabled by default, but pattern matching cannot guarantee removal of every sensitive value. Users should always inspect the privacy preview before copying.

## Permissions

- `activeTab`: temporary access to the page the user chose.
- `scripting`: run the on-demand page capture.
- `sidePanel`: display the companion interface.
- `storage`: remember settings and briefly hand off a selected passage.
- `contextMenus`: add “Prepare selection for Codex”.

No host permissions such as `<all_urls>` are requested.
