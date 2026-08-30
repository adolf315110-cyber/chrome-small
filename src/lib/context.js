export const DEFAULT_SETTINGS = Object.freeze({
  templateId: "summarize",
  outputFormat: "markdown",
  maxChars: 8000,
  includeBody: true,
  includeSelection: true,
  includeHeadings: true,
  includeLinks: false,
  redactSensitive: true,
  customInstructions: ""
});

const SECRET_PATTERNS = [
  {
    label: "email",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[redacted-email]"
  },
  {
    label: "bearer token",
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
    replacement: "Bearer [redacted-token]"
  },
  {
    label: "JWT",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[redacted-jwt]"
  },
  {
    label: "secret field",
    regex: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie)\b(\s*[:=]\s*)([^\s,;]{6,})/gi,
    replacement: "$1$2[redacted-secret]"
  },
  {
    label: "sensitive URL parameter",
    regex: /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|auth|password|secret)=)[^&#\s]+/gi,
    replacement: "$1[redacted]"
  }
];

export function sanitizeSettings(value = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...value };
  return {
    templateId: String(merged.templateId || DEFAULT_SETTINGS.templateId),
    outputFormat: merged.outputFormat === "json" ? "json" : "markdown",
    maxChars: Math.min(20000, Math.max(2000, Number(merged.maxChars) || DEFAULT_SETTINGS.maxChars)),
    includeBody: Boolean(merged.includeBody),
    includeSelection: Boolean(merged.includeSelection),
    includeHeadings: Boolean(merged.includeHeadings),
    includeLinks: Boolean(merged.includeLinks),
    redactSensitive: Boolean(merged.redactSensitive),
    customInstructions: cleanText(merged.customInstructions, 2000)
  };
}

export function cleanText(value, limit = 50000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

export function redactSensitiveText(value) {
  let text = String(value ?? "");
  const findings = [];

  for (const pattern of SECRET_PATTERNS) {
    const count = text.match(pattern.regex)?.length || 0;
    text = text.replace(pattern.regex, pattern.replacement);
    if (count > 0) findings.push({ label: pattern.label, count });
  }

  return {
    text,
    findings,
    count: findings.reduce((sum, item) => sum + item.count, 0)
  };
}

function redactValue(value, enabled, report) {
  const cleaned = cleanText(value);
  if (!enabled || !cleaned) return cleaned;
  const result = redactSensitiveText(cleaned);
  report.push(...result.findings);
  return result.text;
}

function mergeFindings(findings) {
  const counts = new Map();
  for (const item of findings) {
    counts.set(item.label, (counts.get(item.label) || 0) + item.count);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

export function prepareContext(rawContext = {}, rawSettings = {}) {
  const settings = sanitizeSettings(rawSettings);
  const report = [];
  const sourceBody = cleanText(rawContext.bodyText, 50000);
  const bodyText = settings.includeBody ? sourceBody.slice(0, settings.maxChars) : "";
  const omittedChars = settings.includeBody ? Math.max(0, sourceBody.length - bodyText.length) : sourceBody.length;

  const context = {
    title: redactValue(rawContext.title, settings.redactSensitive, report),
    url: redactValue(rawContext.url, settings.redactSensitive, report),
    canonicalUrl: redactValue(rawContext.canonicalUrl, settings.redactSensitive, report),
    description: redactValue(rawContext.description, settings.redactSensitive, report),
    language: cleanText(rawContext.language, 40),
    capturedAt: rawContext.capturedAt || new Date().toISOString(),
    selection: settings.includeSelection
      ? redactValue(cleanText(rawContext.selection, 12000), settings.redactSensitive, report)
      : "",
    headings: settings.includeHeadings
      ? (Array.isArray(rawContext.headings) ? rawContext.headings : []).slice(0, 40).map((heading) => ({
          level: Math.min(6, Math.max(1, Number(heading.level) || 2)),
          text: redactValue(heading.text, settings.redactSensitive, report)
        })).filter((heading) => heading.text)
      : [],
    links: settings.includeLinks
      ? (Array.isArray(rawContext.links) ? rawContext.links : []).slice(0, 30).map((link) => ({
          text: redactValue(link.text, settings.redactSensitive, report),
          url: redactValue(link.url, settings.redactSensitive, report)
        })).filter((link) => link.text && link.url)
      : [],
    bodyText: redactValue(bodyText, settings.redactSensitive, report)
  };

  const findings = mergeFindings(report);
  return {
    context,
    findings,
    redactionCount: findings.reduce((sum, item) => sum + item.count, 0),
    omittedChars
  };
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/([\\`*_{}\[\]<>])/g, "\\$1");
}

function markdownContext(context, omittedChars) {
  const lines = [
    "## Page snapshot",
    "",
    `- **Title:** ${escapeMarkdown(context.title || "Untitled page")}`,
    `- **URL:** ${context.url || "Unavailable"}`,
    `- **Captured:** ${context.capturedAt}`
  ];

  if (context.canonicalUrl && context.canonicalUrl !== context.url) {
    lines.push(`- **Canonical URL:** ${context.canonicalUrl}`);
  }
  if (context.language) lines.push(`- **Language:** ${escapeMarkdown(context.language)}`);
  if (context.description) lines.push("", "### Description", "", context.description);
  if (context.selection) lines.push("", "### Selected text", "", context.selection);
  if (context.headings.length) {
    lines.push("", "### Page outline", "");
    for (const heading of context.headings) {
      lines.push(`${"  ".repeat(Math.max(0, heading.level - 1))}- ${escapeMarkdown(heading.text)}`);
    }
  }
  if (context.bodyText) {
    lines.push("", "### Visible page text", "", context.bodyText);
    if (omittedChars > 0) lines.push("", `_Truncated: ${omittedChars.toLocaleString("en-US")} characters omitted._`);
  }
  if (context.links.length) {
    lines.push("", "### Useful links", "");
    for (const link of context.links) lines.push(`- [${escapeMarkdown(link.text)}](${link.url})`);
  }

  return lines.join("\n");
}

export function formatContext(rawContext, rawSettings = {}) {
  const settings = sanitizeSettings(rawSettings);
  const prepared = prepareContext(rawContext, settings);
  const data = {
    schemaVersion: 1,
    source: "Codex Browser Companion",
    ...prepared.context,
    capture: {
      redactionEnabled: settings.redactSensitive,
      redactionCount: prepared.redactionCount,
      redactions: prepared.findings,
      omittedBodyCharacters: prepared.omittedChars
    }
  };

  return {
    text: settings.outputFormat === "json"
      ? JSON.stringify(data, null, 2)
      : markdownContext(prepared.context, prepared.omittedChars),
    ...prepared
  };
}
