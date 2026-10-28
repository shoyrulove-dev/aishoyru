const host = "shoyruai.blissbiovn.com";
const key = "b3f08a6c9d2e4175a8c6e1f94b7d203a";

export async function notifyIndexNow(paths: string[]) {
  const urlList = paths.map((path) =>
    path.startsWith("http") ? path : `https://${host}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (!urlList.length) return false;
  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList,
      }),
    });
    return response.ok || response.status === 202;
  } catch {
    return false;
  }
}
