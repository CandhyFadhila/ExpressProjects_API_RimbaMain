const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  normJsonbArray,
  normIdArray,
  parseJsonSafe,
  isPlainObject,
} = require("../../helpers/inputNorm");
const { asJsonb } = require("../../helpers/dbJson");
const documentHelper = require("../../helpers/documentHelper");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const activityLogHelper = require("../../helpers/activityLogHelper");

const ONE_MB = 1024 * 1024;
const ALLOWED_IMAGE = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
];
const ALLOWED_VIDEO = [
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
];
const ALLOWED_AUDIO = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/aac",
  "audio/ogg",
];
const ALLOWED_FILE = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
];

function normalizeFiles(req) {
  // dukung .any(), .array('files'), .fields([{name:'files'}]), single .single('file')
  if (Array.isArray(req.files)) return req.files;
  if (req.files?.files && Array.isArray(req.files.files))
    return req.files.files;
  if (req.file) return [req.file];
  return [];
}

function isEmpty(val) {
  return (
    val === undefined ||
    val === null ||
    (typeof val === "string" && val.trim() === "")
  );
}

function badRequest(res, code, title, message, http = 422) {
  const response = new WithoutDataResource(http, code, title, message);
  return res.status(http).json(response.toResponse());
}

function validateFilesForType(type, files) {
  // return null jika OK; kalau ada error return WithoutDataResource
  const err = (code, title, msg) =>
    new WithoutDataResource(422, code, title, msg);

  const mustExactlyOne = () => {
    if (files.length === 0)
      return err(
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "Wajib unggah 1 file."
      );
    if (files.length > 1)
      return err(
        "MAX_FILES",
        "Terlalu Banyak File",
        "Maksimal upload adalah 1 file."
      );
    return null;
  };

  if (type === "Image") {
    const base = mustExactlyOne();
    if (base) return base;
    const f = files[0];
    if (!ALLOWED_IMAGE.includes(f.mimetype))
      return err(
        "INVALID_FILE_TYPE",
        "Tipe File Salah",
        "File hanya diperbolehkan menggunakan format JPG, JPEG, PNG, SVG, atau WebP."
      );
    if (f.size > 50 * ONE_MB)
      return err(
        "FILE_TOO_LARGE",
        "Ukuran File Terlalu Besar",
        "Ukuran maksimal tiap gambar adalah 50mB."
      );
    return null;
  }

  if (type === "Video") {
    const base = mustExactlyOne();
    if (base) return base;
    const f = files[0];
    if (!ALLOWED_VIDEO.includes(f.mimetype))
      return err(
        "INVALID_FILE_TYPE",
        "Tipe File Salah",
        "Video hanya diperbolehkan menggunakan format MP4/MPEG/MOV/MKV/AVI."
      );
    if (f.size > 400 * ONE_MB)
      return err(
        "FILE_TOO_LARGE",
        "Ukuran File Terlalu Besar",
        "Ukuran maksimal tiap video adalah 400MB."
      );
    return null;
  }

  if (type === "Audio") {
    const base = mustExactlyOne();
    if (base) return base;
    const f = files[0];
    if (!ALLOWED_AUDIO.includes(f.mimetype))
      return err(
        "INVALID_FILE_TYPE",
        "Tipe File Salah",
        "Audio hanya diperbolehkan menggunakan format MP3/WAV/AAC/OGG."
      );
    if (f.size > 400 * ONE_MB)
      return err(
        "FILE_TOO_LARGE",
        "Ukuran File Terlalu Besar",
        "Ukuran maksimal tiap audio adalah 400MB."
      );
    return null;
  }

  if (type === "File") {
    const base = mustExactlyOne();
    if (base) return base;
    const f = files[0];
    if (!ALLOWED_FILE.includes(f.mimetype))
      return err(
        "INVALID_FILE_TYPE",
        "Tipe File Salah",
        "File hanya diperbolehkan menggunakan format PDF/DOCX/XLSX/PPTX/TXT/ZIP."
      );
    if (f.size > 50 * ONE_MB)
      return err(
        "FILE_TOO_LARGE",
        "Ukuran File Terlalu Besar",
        "Ukuran maksimal file adalah 50MB."
      );
    return null;
  }

  if (type === "ImageArray") {
    if (files.length === 0)
      return err(
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "Wajib unggah minimal 1 gambar."
      );
    if (files.length > 20)
      return err("MAX_FILES", "Terlalu Banyak File", "Maksimal 20 gambar.");
    for (const f of files) {
      if (!ALLOWED_IMAGE.includes(f.mimetype))
        return err(
          "INVALID_FILE_TYPE",
          "Tipe File Salah",
          "Semua gambar harus JPG, JPEG, atau PNG."
        );
      if (f.size > 50 * ONE_MB)
        return err(
          "FILE_TOO_LARGE",
          "Ukuran File Terlalu Besar",
          "Ukuran maksimal tiap gambar adalah 50mB."
        );
    }
    return null;
  }

  // Tipe non-file (Link, Text, TextArray) -> tidak mewajibkan file
  return null;
}

function ensureHttpUrlOrNull(u) {
  try {
    const url = new URL(String(u));
    if (!/^https?:$/i.test(url.protocol)) return null;
    return String(u).trim();
  } catch {
    return null;
  }
}

function validateUploadedFilesForUpdate(type, files) {
  if (!files || files.length === 0) return null;
  return validateFilesForType(type, files);
}

// -------------------------------------- Handler per tipe --------------------------------------
async function handleSingleFileType(type, files, req) {
  // Upload dan return { contentFileIds, contentValue (file_url) }
  const uploadedIds = await documentHelper.uploadDocuments(files, req);
  const ids = (uploadedIds || []).map(Number).filter(Boolean);
  if (ids.length === 0) {
    throw new Error("UPLOAD_FAILED::Tidak ada file yang berhasil diunggah.");
  }
  const docs = await knex("documents")
    .select("id", "file_url")
    .whereIn("id", ids);

  if (!docs.length || !docs[0]?.file_url) {
    throw new Error(
      "FILE_URL_NOT_FOUND::Gagal mendapatkan URL publik file dari storage."
    );
  }
  return {
    contentFileIds: asJsonb(ids),
    contentValue: String(docs[0].file_url),
  };
}

async function handleImageArray(files, req) {
  // Upload banyak & return array URL
  const uploadedIds = await documentHelper.uploadDocuments(files, req);
  const ids = (uploadedIds || []).map(Number).filter(Boolean);
  if (ids.length === 0) {
    throw new Error("UPLOAD_FAILED::Tidak ada file yang berhasil diunggah.");
  }
  const docs = await knex("documents")
    .select("id", "file_url")
    .whereIn("id", ids)
    .orderBy("id", "asc");

  const urls = docs.map((d) => String(d.file_url)).filter(Boolean);
  if (urls.length === 0) {
    throw new Error(
      "FILE_URL_NOT_FOUND::Gagal mendapatkan URL publik file dari storage."
    );
  }
  return {
    contentFileIds: asJsonb(ids),
    contentValue: JSON.stringify(urls), // simpan sebagai JSON array string
  };
}

function handleLink(content) {
  const ok = ensureHttpUrlOrNull(content);
  if (!ok) {
    const err = new WithoutDataResource(
      422,
      "INVALID_LINK",
      "URL Tidak Valid",
      "Nilai content untuk tipe Link harus URL valid (http/https)."
    );
    return { error: err };
  }
  return { contentFileIds: null, contentValue: ok };
}

function handleText(rawContent) {
  // content bisa dikirim object langsung atau string JSON
  let obj = rawContent;
  if (typeof obj === "string") {
    const parsed = parseJsonSafe(obj);
    obj = parsed ?? obj;
  }
  if (
    !(
      isPlainObject(obj) &&
      typeof obj.id === "string" &&
      typeof obj.en === "string"
    )
  ) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_FORMAT",
      "Format Konten Salah",
      "Untuk tipe Text/TextArray, content harus objek dengan properti id dan en bertipe string."
    );
    return { error: err };
  }
  return {
    contentFileIds: null,
    contentValue: JSON.stringify({ id: obj.id, en: obj.en }),
  };
}

function handleTextArray(rawContent) {
  let arr = rawContent;
  if (typeof arr === "string") arr = parseJsonSafe(arr) ?? arr;

  if (!Array.isArray(arr)) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_FORMAT",
      "Format Konten Salah",
      "Untuk tipe TextArray, content harus array of object dengan properti id dan en bertipe string."
    );
    return { error: err };
  }

  const cleaned = arr
    .map((it) => {
      if (!isPlainObject(it)) return null;
      const { id, en } = it;
      if (typeof id !== "string" || typeof en !== "string") return null;
      return { id, en };
    })
    .filter(Boolean);

  if (cleaned.length !== arr.length || cleaned.length === 0) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_ITEMS",
      "Elemen Konten Tidak Valid",
      "Setiap elemen harus objek dengan id dan en (string), dan minimal satu elemen valid."
    );
    return { error: err };
  }

  return {
    contentFileIds: null,
    contentValue: JSON.stringify(cleaned),
  };
}

exports.store = async (req, res) => {
  const trx = await knex.transaction();
  const { type } = req.body;
  let { content, order } = req.body;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      return badRequest(
        res,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
    }

    // 2) Normalisasi files
    const files = normalizeFiles(req);

    // 3) Validasi files per tipe
    const fileErr = validateFilesForType(type, files);
    if (fileErr) {
      return res.status(422).json(fileErr.toResponse());
    }

    // 4) Proses sesuai tipe
    let content_file_ids = null;
    let content_value = null;

    if (["Image", "Video", "Audio", "File"].includes(type)) {
      const result = await handleSingleFileType(type, files, req);
      content_file_ids = result.contentFileIds;
      content_value = result.contentValue;
    } else if (type === "ImageArray") {
      const result = await handleImageArray(files, req);
      content_file_ids = result.contentFileIds;
      content_value = result.contentValue;
    } else if (type === "Link") {
      const result = handleLink(content);
      if (result.error) return res.status(422).json(result.error.toResponse());
      content_file_ids = result.contentFileIds;
      content_value = result.contentValue;
    } else if (type === "Text") {
      const result = handleText(content);
      if (result.error) return res.status(422).json(result.error.toResponse());
      content_file_ids = result.contentFileIds;
      content_value = result.contentValue;
    } else if (type === "TextArray") {
      const result = handleTextArray(content);
      if (result.error) return res.status(422).json(result.error.toResponse());
      content_file_ids = result.contentFileIds;
      content_value = result.contentValue;
    } else {
      return badRequest(
        res,
        "UNSUPPORTED_TYPE",
        "Tipe Tidak Didukung",
        "Tipe konten tidak dikenali."
      );
    }

    // 5) Insert ke cms_contents
    const insertPayload = {
      content_file_ids,
      type,
      content: content_value,
    };
    if (!isEmpty(order)) insertPayload.order = Number(order);

    const [row] = await trx("cms_contents")
      .insert(insertPayload)
      .returning("*");

    // 6) Auto set order = id kalau payload order kosong/null
    let finalOrder = row.order;
    if (isEmpty(order)) {
      await trx("cms_contents").update({ order: row.id }).where({ id: row.id });
      finalOrder = row.id;
    }

    // 7) Activity log
    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List Konten",
      },
      trx
    );

    // 8) Commit
    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data konten dengan order '${finalOrder}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();

    // Tangkap error spesifik dari handler (pakai delimiter "::")
    if (typeof error.message === "string" && error.message.includes("::")) {
      const [code, msg] = error.message.split("::");
      logger.error(`| CMS Content | - ${code}: ${msg}`);
      return badRequest(res, code, "Gagal Memproses Berkas", msg);
    }

    logger.error(`| Event CMS | - Error function store: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.update = async (req, res) => {
  const trx = await knex.transaction();
  const { type, content, order, deleteDocumentIds } = req.body;
  const id = req.params.id;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      return badRequest(
        res,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
    }

    const existing = await trx("cms_contents").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    // Tipe efektif (pakai yang lama jika tidak dikirim)
    const effType = type ?? existing.type;

    // Normalisasi & validasi file (hanya jika ada upload)
    const files = normalizeFiles(req);
    const fileErr = validateUploadedFilesForUpdate(effType, files);
    if (fileErr) return res.status(422).json(fileErr.toResponse());

    // 1) Dokumen lama
    const oldIds = normIdArray(normJsonbArray(existing.content_file_ids), {
      as: "number",
    });

    // 2) Hapus dokumen berdasarkan deleteDocumentIds (hanya yang memang milik record ini)
    const deleteIdsReq = normIdArray(deleteDocumentIds, { as: "number" }); // bebas: [2,5] atau "2,5"
    const toDelete = oldIds.filter((x) => deleteIdsReq.includes(x));
    let remainingIds = oldIds;
    if (toDelete.length > 0) {
      await documentHelper.deleteDocuments(toDelete);
      const delSet = new Set(toDelete);
      remainingIds = oldIds.filter((x) => !delSet.has(x));
    }

    // 3) Upload dokumen baru (jika ada)
    let uploadedIds = [];
    if (files.length > 0) {
      uploadedIds = (await documentHelper.uploadDocuments(files, req))
        .map((n) => Number(n))
        .filter(Number.isFinite);
    }

    let content_file_ids = undefined; // undefined => tidak menyentuh kolom jika memang tidak perlu
    let content_value = undefined;

    if (["Image", "Video", "Audio", "File"].includes(effType)) {
      // single file → 1 id final (utamakan yang baru diupload)
      const finalId = uploadedIds[0] ?? remainingIds[0] ?? null;
      if (!finalId) {
        await trx.rollback();
        return badRequest(
          res,
          "FILES_NOT_FOUND",
          "File Tidak Ditemukan",
          "Harus tersedia tepat 1 file untuk tipe ini."
        );
      }

      const doc = await knex("documents")
        .select("file_url")
        .where({ id: finalId })
        .first();
      if (!doc?.file_url) {
        await trx.rollback();
        return badRequest(
          res,
          "FILE_URL_NOT_FOUND",
          "URL File Tidak Ditemukan",
          "Gagal mendapatkan URL publik file dari storage."
        );
      }

      content_file_ids = asJsonb([finalId]);
      content_value = String(doc.file_url);
    } else if (effType === "ImageArray") {
      // multi file → gabung sisa lama + baru, dedup, cek batas
      const finalIds = Array.from(new Set([...remainingIds, ...uploadedIds]));
      if (finalIds.length === 0) {
        await trx.rollback();
        return badRequest(
          res,
          "FILES_NOT_FOUND",
          "File Tidak Ditemukan",
          "Minimal 1 gambar untuk tipe ImageArray."
        );
      }
      if (finalIds.length > 20) {
        await trx.rollback();
        return badRequest(
          res,
          "MAX_FILES",
          "Terlalu Banyak File",
          "Maksimal 20 gambar untuk tipe ImageArray."
        );
      }

      const docs = await knex("documents")
        .select("id", "file_url")
        .whereIn("id", finalIds)
        .orderBy("id", "asc");
      const urls = docs.map((d) => String(d.file_url)).filter(Boolean);
      if (urls.length === 0) {
        await trx.rollback();
        return badRequest(
          res,
          "FILE_URL_NOT_FOUND",
          "URL File Tidak Ditemukan",
          "Gagal mendapatkan URL publik file dari storage."
        );
      }

      content_file_ids = asJsonb(finalIds);
      content_value = JSON.stringify(urls);
    } else if (effType === "Link") {
      const built = handleLink(content);
      if (built.error) return res.status(422).json(built.error.toResponse());
      content_value = built.contentValue;
      content_file_ids = built.contentFileIds; // null
    } else if (effType === "Text") {
      const built = handleText(content);
      if (built.error) return res.status(422).json(built.error.toResponse());
      content_value = built.contentValue;
      content_file_ids = built.contentFileIds; // null
    } else if (effType === "TextArray") {
      const built = handleTextArray(content);
      if (built.error) return res.status(422).json(built.error.toResponse());
      content_value = built.contentValue;
      content_file_ids = built.contentFileIds; // null
    } else {
      return badRequest(
        res,
        "UNSUPPORTED_TYPE",
        "Tipe Tidak Didukung",
        "Tipe konten tidak dikenali."
      );
    }

    // Payload update (hanya set field yang memang berubah/ada)
    const updatePayload = { updated_at: trx.fn.now() };
    if (type !== undefined) updatePayload.type = effType;
    if (content_value !== undefined) updatePayload.content = content_value;
    if (content_file_ids !== undefined)
      updatePayload.content_file_ids = content_file_ids;
    if (order !== undefined && order !== null)
      updatePayload.order = Number(order);

    await trx("cms_contents").where("id", id).update(updatePayload);

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List Kegiatan",
      },
      trx
    );

    await trx.commit();

    const finalOrder = updatePayload.order ?? existing.order;
    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data konten dengan order '${finalOrder}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Event CMS | - Error function update : ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem. Silakan coba lagi nanti."
    );
    return res.status(500).json(response.toResponse());
  }
};
