const {
  parseJsonSafe,
  normJsonbArray,
  isPlainObject,
} = require("../../helpers/inputNorm");
const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../../resources/doc/documentResource");

async function contentResource(row) {
  const type = String(row.type || "").toLowerCase();
  const raw = row.content;
  let normalized = raw;

  if (type === "text") {
    if (isPlainObject(raw)) {
      normalized = raw;
    } else if (typeof raw === "string") {
      const obj = parseJsonSafe(raw);
      if (isPlainObject(obj)) normalized = obj;
    }
  } else if (type === "stringarray" || type === "imagearray") {
    if (Array.isArray(raw)) {
      normalized = raw;
    } else {
      const arrFromJsonb = normJsonbArray(raw);
      if (Array.isArray(arrFromJsonb) && arrFromJsonb.length >= 0) {
        normalized = arrFromJsonb;
      } else if (typeof raw === "string") {
        const arr = parseJsonSafe(raw);
        if (Array.isArray(arr)) normalized = arr;
      }
    }
  } else {
    if (typeof raw === "string") {
      const parsed = parseJsonSafe(raw);
      if (parsed !== null) normalized = parsed;
    }
  }

  const typesWithFiles = new Set([
    "image",
    "video",
    "audio",
    "file",
    "imagearray",
  ]);
  const contentFiles =
    typesWithFiles.has(type) && row.content_file_ids
      ? await resolveArrayRelations(
          row.content_file_ids,
          "documents",
          documentResource
        )
      : [];

  return {
    contentType: row.type,
    content: normalized,
    contentFiles,
  };
}

module.exports = contentResource;
