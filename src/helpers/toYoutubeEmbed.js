function parseTimeToSeconds(t) {
  if (!t) return null;
  // 90, "90" -> 90
  if (/^\d+$/.test(String(t))) return parseInt(t, 10);

  // Bentuk "1h2m3s", "2m10s", "45s"
  const m = String(t).match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (!m) return null;
  const h = parseInt(m[1] || 0, 10);
  const mnt = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  const total = h * 3600 + mnt * 60 + s;
  return Number.isFinite(total) ? total : null;
}

function toYoutubeEmbed(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    // Bukan domain YouTube? biarkan
    const ytHosts = new Set([
      "youtube.com",
      "m.youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "music.youtube.com",
    ]);
    if (!ytHosts.has(host) && !host.endsWith(".youtube.com")) return rawUrl;

    // Kalau sudah embed, biarkan
    if (u.pathname.startsWith("/embed/")) return rawUrl;

    // Ambil video id
    let videoId = null;
    const pathParts = u.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      videoId = pathParts[0] || null;
    } else {
      if (u.pathname.startsWith("/watch")) {
        videoId = u.searchParams.get("v");
      } else if (u.pathname.startsWith("/shorts/")) {
        videoId = pathParts[1] || pathParts[0] || null;
      } else if (u.searchParams.get("v")) {
        videoId = u.searchParams.get("v");
      }
    }

    if (!videoId) return rawUrl;

    // Param start (t/start) -> ?start=seconds
    const t = u.searchParams.get("t") || u.searchParams.get("start");
    const start = parseTimeToSeconds(t);

    // Playlist (opsional, kalau ada kita ikutkan)
    const list = u.searchParams.get("list");

    const base = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    const params = new URLSearchParams();
    if (start && start > 0) params.set("start", String(start));
    if (list) params.set("list", list);

    const out = params.toString() ? `${base}?${params.toString()}` : base;
    return out;
  } catch {
    return rawUrl;
  }
}

module.exports = { toYoutubeEmbed };
