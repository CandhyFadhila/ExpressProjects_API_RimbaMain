function normalizeNameForCredential(fullName = "") {
  if (typeof fullName !== "string") return "";
  // Hilangkan aksen/diakritik (aman untuk nama non-ASCII)
  let s = fullName.normalize("NFD").replace(/\p{Diacritic}/gu, "");

  // Hilangkan gelar umum (prefix/suffix), toleransi titik dan huruf besar/kecil
  const titleRegex =
    /\b(ir|dr|drs|dra|prof|h|hj|kh|ust|ustaz|ustadz|ustadzah|s\.?t|s\.?kom|s\.?e|s\.?si|s\.?pd|s\.?pd\.?i|s\.?farm|s\.?kes|m\.?m|m\.?t|m\.?kom|m\.?si|m\.?sc|m\.?pd|m\.?pd\.?i|m\.?kes|m\.?farm|mba|mph|ph\.?d|sp\.?og|sp\.?b|sp\.?pd|sp\.?p|sp\.?t|sp\.?a)\b/gi;

  s = s.replace(titleRegex, " ");
  s = s.replace(/[.,]/g, " "); // koma/titik jadi spasi
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  s = s.replace(/[^\p{L}\p{N}]+/gu, ""); // sisakan huruf/angka saja
  return s;
}

function makeInitialPasswordFromName(fullName = "") {
  const base = normalizeNameForCredential(fullName);
  return `${base}RIMBA2025`;
}

function stripTitlesOnly(fullName = "") {
  if (typeof fullName !== "string" || !fullName.trim()) return "";

  let s = fullName;

  // Buang koma yang biasanya memisah gelar di belakang nama
  s = s.replace(/[,]/g, " ");

  // Gelar (prefix/suffix) — toleransi titik & spasi, case-insensitive
  const titleRegex =
    /\b(?:ir|insinyur|dr|drs|dra|drg|prof|h|hj|kh|ust|ustaz|ustadz|ustadzah|s\.?\s?t|s\.?\s?kom|s\.?\s?e|s\.?\s?si|s\.?\s?pd(?:\.?\s?i)?|s\.?\s?farm|s\.?\s?kes|m\.?\s?m|m\.?\s?t|m\.?\s?kom|m\.?\s?si|m\.?\s?sc|m\.?\s?pd(?:\.?\s?i)?|m\.?\s?kes|m\.?\s?farm|mba|mph|ph\.?\s?d|sp\.?\s?og|sp\.?\s?b|sp\.?\s?pd|sp\.?\s?p|sp\.?\s?t|sp\.?\s?a)\b\.?/gi;

  // Hapus semua gelar di mana pun posisinya
  s = s.replace(titleRegex, " ");

  // Bersihkan spasi ganda & tanda baca sisa di ujung
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/[.;:]+$/g, "")
    .trim();

  // Jika ada kurung kosong sisa "( )" setelah hapus gelar
  s = s.replace(/\(\s*\)/g, "").trim();

  return s;
}

module.exports = {
  normalizeNameForCredential,
  makeInitialPasswordFromName,
  stripTitlesOnly,
};
