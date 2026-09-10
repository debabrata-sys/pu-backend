const QuestionPaperStock = require("../Models/questionpaperstockds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const stockPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  semester: text(body.semester),
  sno: number(body.sno) || 0,
  papercode: text(body.papercode),
  papername: text(body.papername),
  papersettername: text(body.papersettername),
  papercategory: text(body.papercategory),
  address: text(body.address),
  mainusedstatus: text(body.mainusedstatus),
  atktusedstatus: text(body.atktusedstatus),
  stockmonthyear: text(body.stockmonthyear),
  contactnumber: text(body.contactnumber),
  submissionmode: text(body.submissionmode),
  examinercode: text(body.examinercode),
  email: text(body.email),
  papertype: text(body.papertype),
  status: text(body.status) || 'Available in soft copy',
  user: text(body.user)
});

const buildFilter = (query = {}) => {
  const filter = {};
  const colid = number(query.colid);
  if (colid !== undefined) filter.colid = colid;
  const fields = ["academicyear", "regulation", "program", "programcode", "semester", "papercode", "papersettername", "examinercode"];
  fields.forEach((field) => {
    if (text(query[field])) filter[field] = text(query[field]);
  });
  return filter;
};

const validateStock = (item) => {
  if (item.colid === undefined) return "colid is required";
  if (!item.academicyear) return "academicyear is required";
  if (!item.program) return "program is required";
  if (!item.semester) return "semester is required";
  if (!item.papername) return "papername is required";
  return "";
};

// GET /api/v2/conductexam/question-paper-stock
exports.getStock = async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await QuestionPaperStock.find(filter)
      .sort({ academicyear: -1, program: 1, semester: 1, sno: 1 })
      .lean();
    res.json({ success: true, data, count: data.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v2/conductexam/question-paper-stock
exports.saveStock = async (req, res) => {
  try {
    const payload = stockPayload(req.body);
    const err = validateStock(payload);
    if (err) return res.status(400).json({ success: false, message: err });
    if (req.body._id) {
      const updated = await QuestionPaperStock.findByIdAndUpdate(req.body._id, payload, { new: true, runValidators: true }).lean();
      if (!updated) return res.status(404).json({ success: false, message: "Record not found" });
      return res.json({ success: true, data: updated });
    }
    const doc = await QuestionPaperStock.create(payload);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Duplicate record", details: err.keyValue });
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v2/conductexam/question-paper-stock-delete
exports.deleteStock = async (req, res) => {
  try {
    const { _id, colid } = req.body;
    if (!_id) return res.status(400).json({ success: false, message: "_id is required" });
    const filter = { _id };
    const colidNum = number(colid);
    if (colidNum !== undefined) filter.colid = colidNum;
    const result = await QuestionPaperStock.findOneAndDelete(filter);
    if (!result) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v2/conductexam/question-paper-stock-bulk
exports.bulkStock = async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "items array is required" });
    }
    const results = { inserted: 0, updated: 0, errors: [] };
    for (let i = 0; i < items.length; i++) {
      const payload = stockPayload(items[i]);
      const err = validateStock(payload);
      if (err) { results.errors.push({ row: i + 1, message: err }); continue; }
      try {
        if (items[i]._id) {
          await QuestionPaperStock.findByIdAndUpdate(items[i]._id, payload, { upsert: false });
          results.updated++;
        } else {
          await QuestionPaperStock.create(payload);
          results.inserted++;
        }
      } catch (rowErr) {
        results.errors.push({ row: i + 1, message: rowErr.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v2/conductexam/question-paper-stock-options
exports.getStockOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const all = await QuestionPaperStock.find({ colid }).select("academicyear regulation program programcode semester").lean();
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.json({
      success: true,
      academicyears: uniq(all.map((r) => r.academicyear)),
      regulations: uniq(all.map((r) => r.regulation)),
      programs: uniq(all.map((r) => r.program)),
      semesters: uniq(all.map((r) => r.semester))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
