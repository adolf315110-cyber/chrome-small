import { DEFAULT_SETTINGS } from "./lib/context.js";

const MENU_ID = "codex-companion-selection";
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

async function configureExtension() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Prepare selection for Codex",
    contexts: ["selection"]
  });

  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
}

chrome.runtime.onInstalled.addListener(() => {
  configureExtension().catch((error) => console.error("Setup failed", error));
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  await chrome.storage.session.set({
    pendingSelection: {
      selection: info.selectionText || "",
      title: tab.title || "",
      url: tab.url || "",
      tabId: tab.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_MAX_AGE_MS
    }
  });

  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "capture-page-context" || !tab?.id) return;

  await chrome.storage.session.set({
    pendingCapture: {
      tabId: tab.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_MAX_AGE_MS
    }
  });

  await chrome.sidePanel.open({ tabId: tab.id });
});
