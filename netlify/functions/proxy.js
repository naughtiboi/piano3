export async function handler(event) {
  const t = event.queryStringParameters.url;
  if (!t) {
    return { statusCode: 400, body: "Missing url parameter" };
  }

  const targetUrl = decodeURIComponent(t);
  const resp = await fetch(targetUrl, {
    headers: { "User-Agent": "Netlify-Proxy" }
  });
  let html = await resp.text();

  // Inject <base> for relative paths
  const urlObj = new URL(targetUrl);
  html = html.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${urlObj.origin}/">`
  );

  // Rewrite absolute & protocol-relative src/href
  html = html.replace(
    /(src|href)=["'](https?:\/\/|\/\/)([^"']+)["']/gi,
    (m, attr, proto, rest) => {
      const full = proto === "//" ? "https://" + rest : proto + rest;
      return `${attr}="/proxy?url=${encodeURIComponent(full)}"`;
    }
  );

  // Rewrite srcset
  html = html.replace(
    /srcset=["']([^"']+)["']/gi,
    (_, list) =>
      `srcset="${list.split(",").map(entry => {
        let [url, size] = entry.trim().split(/\s+/);
        if (/^(https?:)?\/\//.test(url)) {
          url = url.startsWith("//") ? "https:" + url : url;
          return `/proxy?url=${encodeURIComponent(url)} ${size}`;
        }
        return entry.trim();
      }).join(", ")}"`
  );

  // Rewrite CSS url(...)
  html = html.replace(
    /url\(["']?(https?:)?\/\/([^)"']+)["']?\)/gi,
    (_, p, rest) =>
      `url("/proxy?url=${encodeURIComponent((p||"https:") + "//" + rest)}")`
  );

  // Fix meta-refresh
  html = html.replace(
    /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["']\d+;\s*url=(https?:\/\/[^"']+)["']/gi,
    (m, url) => m.replace(url, `/proxy?url=${encodeURIComponent(url)}`)
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: html
  };
}
