import { DEFAULT_SETTINGS, formatContext, sanitizeSettings } from "./lib/context.js";
import { PROMPT_TEMPLATES, buildPrompt, getTemplate } from "./lib/templates.js";

const CODEX_URL = "https://chatgpt.com/codex/cloud";
const RESTRICTED_SCHEMES = /^(chrome|edge|about|devtools|view-source|chrome-extension):/i;

const elements = {
  captureButton: document.querySelector("#captureButton"),
  captureHint: document.querySelector("#captureHint"),
  captureState: document.querySelector("#captureState"),
  pageTitle: document.querySelector("#pageTitle"),
  pageUrl: document.querySelector("#pageUrl"),
  templateSelect: document.querySelector("#templateSelect"),
  templateDescription: document.querySelector("#templateDescription"),
  customInstructions: document.querySelector("#customInstructions"),
  maxChars: document.querySelector("#maxChars"),
  maxCharsValue: document.querySelector("#maxCharsValue"),
  includeBody: document.querySelector("#includeBody"),
  includeSelection: document.querySelector("#includeSelection"),
  includeHeadings: document.querySelector("#includeHeadings"),
  includeLinks: document.querySelector("#includeLinks"),
  redactSensitive: document.querySelector("#redactSensitive"),
  preview: document.querySelector("#preview"),
  charCount: document.querySelector("#charCount"),
  redactionCount: document.querySelector("#redactionCount"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
  openCodexButton: document.querySelector("#openCodexButton"),
  toast: document.querySelector("#toast")
};

let settings = { ...DEFAULT_SETTINGS };
let pageContext = null;
let saveTimer;
let toastTimer;

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function isChromeApiAvailable() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync && chrome.scripting);
}

function populateTemplates() {
  for (const template of PROMPT_TEMPLATES) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    elements.templateSelect.append(option);
  }
}

function applySettingsToForm() {
  elements.templateSelect.value = settings.templateId;
  elements.customInstructions.value = settings.customInstructions;
  elements.maxChars.value = String(settings.maxChars);
  elements.maxCharsValue.value = Number(settings.maxChars).toLocaleString();
  elements.includeBody.checked = settings.includeBody;
  elements.includeSelection.checked = settings.includeSelection;
  elements.includeHeadings.checked = settings.includeHeadings;
  elements.includeLinks.checked = settings.includeLinks;
  elements.redactSensitive.checked = settings.redactSensitive;
  document.querySelector(`input[name="outputFormat"][value="${settings.outputFormat}"]`).checked = true;
  updateTemplateDescription();
}

function readSettingsFromForm() {
  return sanitizeSettings({
    templateId: elements.templateSelect.value,
    outputFormat: document.querySelector('input[name="outputFormat"]:checked')?.value,
    maxChars: elements.maxChars.value,
    includeBody: elements.includeBody.checked,
    includeSelection: elements.includeSelection.checked,
    includeHeadings: elements.includeHeadings.checked,
    includeLinks: elements.includeLinks.checked,
    redactSensitive: elements.redactSensitive.checked,
    customInstructions: elements.customInstructions.value
  });
}

function updateTemplateDescription() {
  const template = getTemplate(elements.templateSelect.value);
  elements.templateDescription.textContent = template.description;
  elements.customInstructions.placeholder = template.id === "custom"
    ? "Describe exactly what you want Codex to do."
    : "For example: answer in Chinese and include an action checklist.";
}

function scheduleSave() {
  settings = readSettingsFromForm();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (isChromeApiAvailable()) await chrome.storage.sync.set(settings);
  }, 180);
  renderPreview();
}

function renderPreview() {
  settings = readSettingsFromForm();
  elements.maxCharsValue.value = Number(settings.maxChars).toLocaleString();

  if (!pageContext) {
    elements.preview.value = "Capture a page or select text to generate a privacy-reviewed prompt.";
    elements.charCount.textContent = "0 chars";
    elements.redactionCount.textContent = "0 redacted";
    elements.copyButton.disabled = true;
    elements.downloadButton.disabled = true;
    return;
  }

  const formatted = formatContext(pageContext, settings);
  const prompt = buildPrompt(formatted.text, settings);
  elements.preview.value = prompt;
  elements.charCount.textContent = `${prompt.length.toLocaleString()} chars`;
  elements.redactionCount.textContent = `${formatted.redactionCount} redacted`;
  elements.copyButton.disabled = false;
  elements.downloadButton.disabled = false;
}

function showContext(context, source = "Captured") {
  pageContext = context;
  elements.pageTitle.textContent = context.title || "Untitled page";
  elements.pageUrl.textContent = context.url || "Selection only";
  elements.captureState.textContent = source;
  elements.captureState.classList.add("is-ready");
  renderPreview();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab was found.");
  return tab;
}

function assertCaptureAllowed(tab) {
  if (!tab.url || RESTRICTED_SCHEMES.test(tab.url)) {
    throw new Error("Chrome blocks extensions from reading this protected page. Open a normal website and try again.");
  }
  if (/^file:/i.test(tab.url)) {
    throw new Error("File pages require the optional “Allow access to file URLs” setting in Chrome.");
  }
}

async function captureCurrentPage(expectedTabId) {
  elements.captureButton.disabled = true;
  elements.captureButton.textContent = "Capturing…";

  try {
    if (!isChromeApiAvailable()) throw new Error("Load this folder as a Chrome extension to capture pages.");
    const tab = await getActiveTab();
    if (expectedTabId && tab.id !== expectedTabId) throw new Error("The selected tab changed. Click capture again on the target page.");
    assertCaptureAllowed(tab);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/injected/capture-page.js"]
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.__CODEX_COMPANION_CAPTURE__?.()
    });
    if (!result?.result) throw new Error("The page did not return any readable context.");

    showContext(result.result);
    elements.captureHint.textContent = "Snapshot ready. Review the generated text below before copying it.";
    showToast("Page captured locally");
  } catch (error) {
    elements.captureHint.textContent = error.message;
    showToast(error.message, true);
  } finally {
    elements.captureButton.disabled = false;
    elements.captureButton.innerHTML = '<span aria-hidden="true">◎</span> Capture current page';
  }
}

async function consumePendingAction() {
  if (!isChromeApiAvailable()) return;
  const { pendingSelection, pendingCapture } = await chrome.storage.session.get(["pendingSelection", "pendingCapture"]);
  await chrome.storage.session.remove(["pendingSelection", "pendingCapture"]);
  const now = Date.now();

  if (pendingSelection?.expiresAt > now) {
    showContext({
      title: pendingSelection.title,
      url: pendingSelection.url,
      selection: pendingSelection.selection,
      capturedAt: new Date(pendingSelection.createdAt).toISOString(),
      headings: [],
      links: [],
      bodyText: ""
    }, "Selection ready");
    showToast("Selected text is ready to review");
  } else if (pendingCapture?.expiresAt > now) {
    await captureCurrentPage(pendingCapture.tabId);
  }
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(elements.preview.value);
    showToast("Prompt copied — paste it into Codex");
  } catch {
    elements.preview.select();
    showToast("Clipboard was blocked. The prompt is selected for manual copy.", true);
  }
}

function downloadPrompt() {
  const extension = settings.outputFormat === "json" ? "json" : "md";
  const safeTitle = String(pageContext?.title || "page-context")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70) || "page-context";
  const blob = new Blob([elements.preview.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeTitle}-codex-prompt.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Prompt downloaded");
}

async function initialize() {
  populateTemplates();
  if (isChromeApiAvailable()) {
    settings = sanitizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  }
  applySettingsToForm();
  renderPreview();
  await consumePendingAction();
}

elements.captureButton.addEventListener("click", () => captureCurrentPage());
elements.copyButton.addEventListener("click", copyPrompt);
elements.downloadButton.addEventListener("click", downloadPrompt);
elements.openCodexButton.addEventListener("click", async () => {
  if (isChromeApiAvailable()) await chrome.tabs.create({ url: CODEX_URL });
  else window.open(CODEX_URL, "_blank", "noopener");
});

for (const element of [
  elements.templateSelect,
  elements.customInstructions,
  elements.maxChars,
  elements.includeBody,
  elements.includeSelection,
  elements.includeHeadings,
  elements.includeLinks,
  elements.redactSensitive,
  ...document.querySelectorAll('input[name="outputFormat"]')
]) {
  element.addEventListener("input", () => {
    updateTemplateDescription();
    scheduleSave();
  });
}

initialize().catch((error) => showToast(error.message, true));
