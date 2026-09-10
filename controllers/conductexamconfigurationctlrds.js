const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const ConductExamConfiguration = require("../Models/conductexamconfigurationds");
const Institution = require("../Models/insdetails");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
exports.uploadMiddleware = upload.single("logo");

const text = (v) => String(v || "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

const getDefaultAwsConfig = async (colid) => {
  try {
    return await Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await Awsconfig.findOne({ type: /^aws$/i }).sort({ _id: -1 }).lean();
  } catch (err) {
    return null;
  }
};

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => region === "us-east-1"
  ? "https://" + bucket + ".s3.amazonaws.com/" + encodeS3Key(key)
  : "https://" + bucket + ".s3." + region + ".amazonaws.com/" + encodeS3Key(key);

/**
 * Reusable helper to get active Exam Configuration for any backend controller / email helper
 */
async function getExamConfigHelper(colid) {
  try {
    const colNumber = num(colid);
    let cfg = null;
    if (colNumber !== undefined) {
      cfg = await ConductExamConfiguration.findOne({ colid: colNumber }).lean();
    }
    if (!cfg) {
      cfg = await ConductExamConfiguration.findOne().sort({ updatedAt: -1 }).lean();
    }

    // Fallback to insdetails if nothing in exam configuration yet
    let ins = null;
    if (colNumber !== undefined) {
      ins = await Institution.findOne({ colid: colNumber }).lean();
    }
    if (!ins) {
      ins = await Institution.findOne().lean();
    }

    return {
      colid: colNumber || cfg?.colid || ins?.colid || 1,
      institutionname: cfg?.institutionname || ins?.institutionname || ins?.insname || "",
      affiliatedboard: cfg?.affiliatedboard || "",
      address: cfg?.address || ins?.address || "",
      coename: cfg?.coename || "",
      coetitle: cfg?.coetitle || "Assistant Registrar(Confidential)",
      vcname: cfg?.vcname || ins?.vcname || "",
      vctitle: cfg?.vctitle || "Vice Chancellor",
      logo: cfg?.logo || ins?.logolink || "",
      phone: cfg?.phone || ins?.contactusdetails || "",
      email: cfg?.email || ins?.contactemail || "",
      website: cfg?.website || ""
    };
  } catch (error) {
    console.error("[conductexamconfigurationctlrds] getExamConfigHelper error:", error.message);
    return {
      institutionname: "",
      affiliatedboard: "",
      address: "",
      coename: "",
      coetitle: "Assistant Registrar(Confidential)",
      vcname: "",
      vctitle: "Vice Chancellor",
      logo: "",
      phone: "",
      email: "",
      website: ""
    };
  }
}

exports.getExamConfigHelper = getExamConfigHelper;

/**
 * GET /api/v2/conductexam/configuration
 */
exports.getExamConfiguration = async (req, res) => {
  try {
    const colid = num(req.query.colid) || num(req.body.colid) || 1;
    let config = await ConductExamConfiguration.findOne({ colid }).lean();

    if (!config) {
      // Prefill from insdetails if exists
      const ins = await Institution.findOne({ colid }).lean() || await Institution.findOne().lean();
      config = {
        colid,
        institutionname: ins?.institutionname || ins?.insname || "",
        affiliatedboard: "",
        address: ins?.address || "",
        coename: "",
        coetitle: "Assistant Registrar(Confidential)",
        vcname: ins?.vcname || "",
        vctitle: "Vice Chancellor",
        logo: ins?.logolink || "",
        phone: ins?.contactusdetails || "",
        email: ins?.contactemail || "",
        website: ""
      };
    }

    res.json({ success: true, data: config });
  } catch (error) {
    console.error("[getExamConfiguration] error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/conductexam/configuration
 */
exports.saveExamConfiguration = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) {
      return res.status(400).json({ success: false, message: "colid is required" });
    }

    const payload = {
      institutionname: text(req.body.institutionname),
      affiliatedboard: text(req.body.affiliatedboard),
      address: text(req.body.address),
      coename: text(req.body.coename),
      coetitle: text(req.body.coetitle) || "Controller of Examinations",
      vcname: text(req.body.vcname),
      vctitle: text(req.body.vctitle) || "Vice Chancellor",
      logo: text(req.body.logo),
      phone: text(req.body.phone),
      email: text(req.body.email),
      website: text(req.body.website),
      updatedby: text(req.body.user || req.body.updatedby)
    };

    if (!payload.institutionname) {
      return res.status(400).json({ success: false, message: "Institution Name is required" });
    }

    const updated = await ConductExamConfiguration.findOneAndUpdate(
      { colid },
      {
        $set: payload,
        $setOnInsert: { colid, createdby: text(req.body.user || req.body.createdby) }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: "Exam configuration saved successfully",
      data: updated
    });
  } catch (error) {
    console.error("[saveExamConfiguration] error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/v2/conductexam/configuration-logo-upload
 */
exports.uploadLogo = async (req, res) => {
  try {
    const colid = num(req.body.colid) || 1;
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Logo file is required" });
    }

    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const awsConfig = await getDefaultAwsConfig(colid);

    if (awsConfig?.username && awsConfig?.password && awsConfig?.bucket && awsConfig?.region) {
      const key = colid + "/conduct-exam/logos/" + Date.now() + "-" + cleanName;
      const s3 = new AWS.S3({
        accessKeyId: awsConfig.username,
        secretAccessKey: awsConfig.password,
        region: awsConfig.region
      });

      await s3.putObject({
        Bucket: awsConfig.bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      }).promise();

      const url = s3Url(awsConfig.bucket, awsConfig.region, key);
      return res.json({ success: true, url, filename: cleanName });
    }

    // Fallback to data URI if AWS is not configured
    const base64Data = req.file.buffer.toString("base64");
    const dataUri = "data:" + req.file.mimetype + ";base64," + base64Data;
    res.json({ success: true, url: dataUri, filename: cleanName });
  } catch (error) {
    console.error("[uploadLogo] error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
