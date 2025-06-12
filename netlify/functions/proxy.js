export async function handler(event) {
  const t = event.queryStringParameters.url;
  if (!t) {
    return { statusCode: 400, body: "Missing url parameter" };
  }

  const targetUrl = decodeURIComponent(t);
  const resp = await fetch(targetUrl, {
    headers: { "User-Agent": "Netlify-Proxy" },
  });
  let html = await resp.text();

  // Base tag for relative paths
  const urlObj = new URL(targetUrl);
  html = html.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${urlObj.origin}/">`
  );

  // Helper to rewrite absolute URLs via /proxy
  const rewriteAttr = (attr) =>
    new RegExp(`${attr}=["'](https?:\/\/[^"']+)["']`, "gi");

  // Rewrite src=, href=, script src=, link href=
  [ "src", "href" ].forEach((attr) => {
    html = html.replace(rewriteAttr(attr), (_, url) =>
      `${attr}="/proxy?url=${encodeURIComponent(url)}"`
    );
  });

  // Specifically catch <script src="...">
  html = html.replace(
    /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    (m, url) =>
      m.replace(url, `/proxy?url=${encodeURIComponent(url)}`)
  );

  // Catch <link rel="stylesheet" href="...">
  html = html.replace(
    /<link\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    (m, url) =>
      m.replace(url, `/proxy?url=${encodeURIComponent(url)}`)
  );

  // Rewrite CSS url(...) inside style blocks or inline styles
  html = html.replace(
    /url\(["']?(https?:\/\/[^)"']+)["']?\)/gi,
    (_, url) => `url("/proxy?url=${encodeURIComponent(url)}")`
  );

  // Rewrite srcset
  html = html.replace(
    /srcset=["']([^"']+)["']/gi,
    (_, list) =>
      `srcset="${list
        .split(",")
        .map((entry) => {
          let [u, size] = entry.trim().split(/\s+/);
          if (/https?:\/\//.test(u)) {
            return `/proxy?url=${encodeURIComponent(u)} ${size}`;
          }
          return entry.trim();
        })
        .join(", ")}"`
  );

  // Fix meta-refresh
  html = html.replace(
    /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["']\d+;\s*url=(https?:\/\/[^"']+)["']/gi,
    (m, url) => m.replace(url, `/proxy?url=${encodeURIComponent(url)}`)
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: html,
  };
}
