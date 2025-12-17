const cors = require("cors");

const corsOptions = {
  origin: ["https://rimba-atrbpn-admin.vercel.app", "https://rimba-atrbpn.vercel.app", "https://rimba.webgis.app", "https://rimba.webgis.app"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

module.exports = cors(corsOptions);
