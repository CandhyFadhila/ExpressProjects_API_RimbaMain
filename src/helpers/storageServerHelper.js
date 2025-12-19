const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const { resolvePublicBaseUrl } = require("../utils/baseUrl");

class StorageServerHelper {
  static token = null;
  static baseURL = null;
  static email = null;
  static password = null;
  static loginPromise = null;

  static FILE_FIELD = "files";

  static getStaticDocumentAccount() {
    return {
      email: "rimba.development@gmail.com",
      password: "dokumenrimbaadmin123",
    };
  }

  static init() {
    if (!this.baseURL) {
      this.baseURL = resolvePublicBaseUrl("docs", {
        app: process.env.PORT || 4000,
        docs: process.env.DOC_SERVER_PORT || 4001,
      });

      const staticAcc = this.getStaticDocumentAccount();
      this.email = staticAcc.email;
      this.password = staticAcc.password;

      if (!this.baseURL || !this.email || !this.password) {
        logger.error(
          "| Storage Server Helper | - Init error: konfigurasi tidak lengkap."
        );
        throw new Error("Konfigurasi tidak lengkap.");
      }
    }
  }

  static axios() {
    this.init();
    return axios.create({
      baseURL: this.baseURL,
      timeout: 60_000,
    });
  }

  static async ensureToken(force = false) {
    this.init();
    if (this.token && !force) return this.token;

    // lock agar login tidak paralel
    if (!this.loginPromise) {
      this.loginPromise = this.login(true)
        .catch((e) => {
          throw e;
        })
        .finally(() => {
          this.loginPromise = null;
        });
    }
    await this.loginPromise;
    return this.token;
  }

  static isTokenErrorCase(payload) {
    if (!payload || typeof payload !== "object") return null;

    const errCase = payload.case || payload?.data?.case || payload?.error?.case;

    const tokenErrorCases = [
      "TOKEN_BLACKLISTED",
      "TOKEN_EXPIRED",
      "LOGIN_EXPIRED",
      "INVALID_TOKEN",
    ];

    if (errCase && tokenErrorCases.includes(errCase)) {
      return errCase;
    }

    return null;
  }

  static async withTokenAutoRefresh(requestFn, allowRetry = true) {
    this.init();
    await this.ensureToken(); // pastikan token awal sudah ada

    const exec = async (retry) => {
      const currentToken = this.token; // token terbaru saat ini

      const res = await requestFn(currentToken);
      const payload =
        typeof res.data === "string" ? safeJson(res.data) : res.data;

      // Kalau 401 & terdeteksi error token, coba refresh token dan retry sekali
      if (res.status === 401 && retry) {
        const tokenCase = this.isTokenErrorCase(payload);
        if (tokenCase) {
          logger.warn(
            `| Storage Server Helper | - Token bermasalah (${tokenCase}), mencoba login ulang & retry sekali.`
          );

          // Paksa login ulang
          await this.ensureToken(true);

          // Retry sekali dengan token baru
          return exec(false);
        }
      }

      return { res, payload };
    };

    return exec(allowRetry);
  }

  static async login(force = false) {
    this.init();
    if (this.token && !force) return this.token;

    try {
      const res = await this.axios().post(
        "/cms/api/rimba/docs/signin",
        { email: this.email, password: this.password },
        { validateStatus: () => true }
      );

      const payload =
        typeof res.data === "string" ? safeJson(res.data) : res.data;

      if (res.status >= 400) {
        logger.error(
          `| Storage Server Helper | - Login gagal: Status ${
            res.status
          }. Body: ${JSON.stringify(payload)}.`
        );
        throw new Error(
          `Login gagal. Status ${res.status}. Body: ${JSON.stringify(payload)}`
        );
      }

      const token = payload?.data?.token;
      if (!token) {
        logger.error(
          `| Storage Server Helper | - Login berhasil tapi token tidak ditemukan pada 'data.token'. Body: ${JSON.stringify(
            payload
          )}`
        );
        throw new Error(
          `Login berhasil tapi token tidak ditemukan pada 'data.token'. Body: ${JSON.stringify(
            payload
          )}`
        );
      }

      this.token = token;
      return token;
    } catch (err) {
      logger.error("| Storage Server Helper | - Login error:", err.message);
      throw err;
    }
  }

  static async logout() {
    if (!this.token) return;

    try {
      await this.axios().get("/cms/api/rimba/docs/signout", {
        headers: { Authorization: `Bearer ${this.token}` },
        validateStatus: () => true,
      });
    } catch (err) {
      logger.warn("| Storage Server Helper | - Logout error:", err.message);
    } finally {
      this.token = null;
    }
  }

  static async uploadToServer(files) {
    this.init();
    await this.ensureToken();

    const normalized = normalizeFiles(files);
    if (!normalized.length) {
      logger.error(
        "| Storage Server Helper | - Tidak ada file yang dikirim untuk diunggah."
      );
      throw new Error("Tidak ada file yang dikirim untuk diunggah.");
    }

    const buildForm = () => {
      const form = new FormData();

      for (const f of normalized) {
        const originalName = f.originalname;
        const extFromName = path.extname(originalName || "").replace(/^\./, "");
        const ext = extFromName
          ? extFromName
          : this.getExtensionFromMimeType(f.mimetype) || "bin";

        const filename = extFromName ? originalName : `${originalName}.${ext}`;

        if (f.buffer && Buffer.isBuffer(f.buffer)) {
          form.append(this.FILE_FIELD, f.buffer, {
            filename,
            contentType: f.mimetype || "application/octet-stream",
          });
        } else if (f.path && fs.existsSync(f.path)) {
          form.append(this.FILE_FIELD, fs.createReadStream(f.path), {
            filename,
            contentType: f.mimetype || "application/octet-stream",
          });
        } else {
          logger.warn(
            `| Storage Server Helper | - File tidak valid/tiada buffer/path: ${f.originalname}`
          );
        }
      }

      return form;
    };

    const tmpForm = buildForm();
    if (!hasFormFile(tmpForm, this.FILE_FIELD)) {
      logger.error(
        "| Storage Server Helper | - Tidak ada file valid untuk diunggah."
      );
      throw new Error("Tidak ada file valid untuk diunggah.");
    }

    const { res, payload } = await this.withTokenAutoRefresh(
      async (token) => {
        const form = buildForm(); // bangun ulang tiap attempt
        const headers = {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`,
        };

        return this.axios().post("/cms/api/rimba/docs/upload-file", form, {
          headers,
          maxBodyLength: Infinity,
          validateStatus: () => true,
        });
      },
      true // allowRetry = true
    );

    if (res.status >= 400) {
      logger.error(
        `| Storage Server Helper | - Upload gagal: Status ${
          res.status
        }. Body: ${JSON.stringify(payload)}.`
      );
      throw new Error(
        `Upload gagal. Status ${res.status}. Body: ${JSON.stringify(payload)}`
      );
    }

    const data = payload?.data;
    if (typeof data === "undefined") {
      logger.error(
        `| Storage Server Helper | - Response tidak memiliki 'data'. Body: ${JSON.stringify(
          payload
        )}`
      );
      throw new Error(
        `Response tidak memiliki 'data'. Body: ${JSON.stringify(payload)}`
      );
    }

    return data;
  }

  static async deleteFromServer(fileIds = []) {
    this.init();
    await this.ensureToken();

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      logger.error(
        "| Storage Server Helper | - Tidak ada file_id yang dikirim untuk dihapus."
      );
      throw new Error("Tidak ada file_id yang dikirim untuk dihapus.");
    }

    const ids = fileIds.map(String).filter(Boolean);
    const uuidV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const bad = ids.filter((id) => !uuidV4.test(id));
    if (bad.length) {
      throw new Error(`ID bukan UUID v4: ${bad.join(", ")}`);
    }

    const bodyPayload = { document_ids: ids }; // <— WAJIB: server dokumen minta 'document_ids'

    const { res, payload: payloadRes } = await this.withTokenAutoRefresh(
      async (token) => {
        return this.axios().delete("/cms/api/rimba/docs/delete-file", {
          headers: { Authorization: `Bearer ${token}` },
          data: bodyPayload,
          validateStatus: () => true,
        });
      },
      true // allowRetry
    );

    if (res.status >= 400) {
      logger.error(
        `| Storage Server Helper | - Delete gagal: Status ${
          res.status
        }. Body: ${JSON.stringify(payloadRes)}.`
      );
      throw new Error(
        `Delete gagal. Status ${res.status}. Body: ${JSON.stringify(
          payloadRes
        )}`
      );
    }

    // === Normalisasi sukses tanpa field 'data' ===
    const desc = payloadRes?.message?.description || "";
    const m = desc.match(/menghapus\s+(\d+)\s+dokumen/i);
    const deletedCount = m ? Number(m[1]) : null;

    return {
      status: payloadRes?.status ?? res.status,
      case: payloadRes?.case ?? "DELETE_SUCCESS",
      message: payloadRes?.message ?? null,
      deleted_count: deletedCount,
      raw: payloadRes,
    };
  }

  static getExtensionFromMimeType(mimeType) {
    const mimeMap = {
      "text/plain": "txt",
      "text/html": "html",
      "text/css": "css",
      "text/csv": "csv",
      "text/xml": "xml",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/bmp": "bmp",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/x-ms-wma": "wma",
      "video/mp4": "mp4",
      "video/ogg": "ogv",
      "video/webm": "webm",
      "video/x-msvideo": "avi",
      "video/x-ms-wmv": "wmv",
      "application/pdf": "pdf",
      "application/zip": "zip",
      "application/x-rar-compressed": "rar",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "xlsx",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
      "application/vnd.ms-powerpoint": "ppt",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "pptx",
      "application/json": "json",
      "application/javascript": "js",
      "application/vnd.oasis.opendocument.text": "odt",
      "application/vnd.oasis.opendocument.spreadsheet": "ods",
      "application/vnd.oasis.opendocument.presentation": "odp",
      "font/otf": "otf",
      "font/ttf": "ttf",
      "font/woff": "woff",
      "font/woff2": "woff2",
      "application/octet-stream": "bin",
    };

    return mimeMap[mimeType] || "bin";
  }
}

/* =========================
 * Util Functions
 * ========================= */

function normalizeFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return [files];
}

function safeJson(maybeJson) {
  try {
    return JSON.parse(maybeJson);
  } catch {
    return { raw: String(maybeJson) };
  }
}

function hasFormFile(form, fieldName) {
  // FormData dari 'form-data' menyimpan _streams; kita cek kasar saja.
  // Alternatif: skip check ini, karena server akan me-reject jika kosong.
  return (
    form &&
    form._streams &&
    form._streams.some(
      (s) =>
        typeof s === "function" ||
        (typeof s === "string" && s.includes(`name="${fieldName}"`))
    )
  );
}

module.exports = StorageServerHelper;
