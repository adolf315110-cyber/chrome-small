(() => {
  const clean = (value, limit = 50000) => String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);

  const isVisible = (element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  };

  globalThis.__CODEX_COMPANION_CAPTURE__ = () => {
    const description = document.querySelector('meta[name="description"]')?.content
      || document.querySelector('meta[property="og:description"]')?.content
      || "";
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || "";
    const selection = clean(globalThis.getSelection?.()?.toString(), 12000);

    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter(isVisible)
      .map((element) => ({
        level: Number(element.tagName.slice(1)),
        text: clean(element.innerText || element.textContent, 300)
      }))
      .filter((item) => item.text)
      .slice(0, 40);

    const seenLinks = new Set();
    const links = [...document.querySelectorAll("a[href]")]
      .filter(isVisible)
      .map((element) => ({
        text: clean(element.innerText || element.getAttribute("aria-label") || element.title, 200),
        url: element.href
      }))
      .filter((item) => {
        if (!item.text || !/^https?:/i.test(item.url) || seenLinks.has(item.url)) return false;
        seenLinks.add(item.url);
        return true;
      })
      .slice(0, 30);

    return {
      title: clean(document.title, 500),
      url: location.href,
      canonicalUrl,
      description: clean(description, 1000),
      language: document.documentElement.lang || navigator.language || "",
      selection,
      headings,
      links,
      bodyText: clean(document.body?.innerText, 50000),
      capturedAt: new Date().toISOString()
    };
  };
})();
