const QuestionPaperStock = require("../Models/questionpaperstockds");

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const stockPayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear || body.scheme),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  branch: text(body.branch || body.speciality),
  dateoflastexam: text(body.dateoflastexam),
  semester: text(body.semester),
  sno: number(body.sno) || 0,
  papercode: text(body.papercode),
  papername: text(body.papername),
  papersettername: text(body.papersettername),
  papercategory: text(body.papercategory),
  address: text(body.address),
  mainusedstatus: text(body.mainusedstatus),
  atktusedstatus: text(body.atktusedstatus),
  stockmonth: text(body.stockmonth),
  stockyear: text(body.stockyear),
  stockmonthyear: text(body.stockmonthyear),
  contactnumber: text(body.contactnumber),
  submissionmode: text(body.submissionmode) || "Soft Copy",
  examinercode: text(body.examinercode),
  email: text(body.email),
  papertype: text(body.papertype) || "Main",
  status: text(body.status) || 'Available Soft copy',
  faculty: text(body.faculty),
  remarks: text(body.remarks),
  user: text(body.user)
});

const buildFilter = (query = {}) => {
  const filter = {};
  const colid = number(query.colid);
  if (colid !== undefined) filter.colid = colid;
  const fields = ["academicyear", "regulation", "program", "programcode", "branch", "semester", "papercode", "papersettername", "examinercode", "papertype", "status", "faculty"];
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

// POST /api/v2/conductexam/question-paper-stock-mark-used
exports.markUsed = async (req, res) => {
  try {
    const { _id, colid, usedtype, examdate, dateoflastexam, remarks } = req.body;
    if (!_id) return res.status(400).json({ success: false, message: "_id is required" });
    const colidNum = number(colid);
    if (colidNum === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const stock = await QuestionPaperStock.findOne({ _id, colid: colidNum });
    if (!stock) return res.status(404).json({ success: false, message: "Stock record not found" });

    const formattedExam = text(examdate) ? `Used in Exam ${text(examdate)}` : "Used in Exam";

    if (usedtype === "Main") {
      stock.mainusedstatus = formattedExam;
      stock.status = "Used";
    } else if (usedtype === "ATKT" || usedtype === "Suppl") {
      stock.atktusedstatus = formattedExam;
      stock.status = "Used";
    } else if (usedtype === "Both") {
      stock.mainusedstatus = formattedExam;
      stock.atktusedstatus = formattedExam;
      stock.status = "Used";
    } else if (usedtype === "Unused") {
      stock.mainusedstatus = " -";
      stock.atktusedstatus = " -";
      stock.status = stock.papertype === "ATKT" ? "Moderated ATKT" : "Available Soft copy";
    }

    if (text(dateoflastexam)) stock.dateoflastexam = text(dateoflastexam);
    if (text(remarks)) stock.remarks = text(remarks);
    if (text(req.body.user)) stock.user = text(req.body.user);

    await stock.save();
    res.json({ success: true, message: "Stock updated successfully", data: stock });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v2/conductexam/question-paper-stock-unused-report
exports.getUnusedStockReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.program)) filter.program = text(req.query.program);
    if (text(req.query.semester)) filter.semester = text(req.query.semester);
    if (text(req.query.faculty)) filter.faculty = text(req.query.faculty);

    const all = await QuestionPaperStock.find(filter)
      .sort({ program: 1, semester: 1, sno: 1, papercode: 1 })
      .lean();

    const rows = all.map((item, idx) => {
      const month = item.stockmonth || (item.stockmonthyear ? item.stockmonthyear.split('-')[0] : "");
      const year = item.stockyear || (item.stockmonthyear ? (item.stockmonthyear.includes('-') ? ("20" + item.stockmonthyear.split('-')[1]) : item.stockmonthyear) : item.academicyear);

      return {
        _id: item._id,
        sno: item.sno || idx + 1,
        program: item.program,
        scheme: item.academicyear,
        branch: item.branch || "N/A",
        semester: item.semester,
        dateoflastexam: item.dateoflastexam || " -",
        papercode: item.papercode,
        papername: item.papername,
        month: month || " -",
        year: year || " -",
        category: item.papercategory || " -",
        mainusedstatus: item.mainusedstatus || (item.status?.includes("Main") ? item.status : "Available Main"),
        atktusedstatus: item.atktusedstatus || (item.status?.includes("ATKT") ? item.status : "Available Suppl."),
        mode: item.submissionmode || "Soft Copy",
        remark: item.remarks || item.examinercode || " -",
        status: item.status,
        papersettername: item.papersettername
      };
    });

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      lastUpdated: new Date()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Helper to sync question paper creation or moderation into questionpaperstockds
exports.syncPaperToStock = async (paperDoc, options = {}) => {
  try {
    if (!paperDoc || !paperDoc.colid) return null;
    const colid = number(paperDoc.colid);
    const papercode = text(paperDoc.coursecode || paperDoc.papercode);
    const papername = text(paperDoc.course || paperDoc.papername);
    const academicyear = text(paperDoc.academicyear || paperDoc.scheme);
    const program = text(paperDoc.program);
    const semester = text(paperDoc.semester);

    if (!papername || !academicyear || !program || !semester) return null;

    let stock = await QuestionPaperStock.findOne({
      colid,
      papercode,
      academicyear,
      program,
      semester
    });

    const targetStatus = text(options.status) || "Available Soft copy";

    if (!stock) {
      stock = new QuestionPaperStock({
        colid,
        academicyear,
        regulation: text(paperDoc.regulation),
        program,
        programcode: text(paperDoc.programcode),
        branch: text(paperDoc.branch || paperDoc.subject),
        semester,
        papercode,
        papername,
        papersettername: text(paperDoc.papersettername),
        papercategory: text(paperDoc.papercategory) || "A",
        submissionmode: text(options.submissionmode) || "Soft Copy",
        papertype: text(paperDoc.papertype || options.papertype) || "Main",
        status: targetStatus,
        mainusedstatus: targetStatus === "Moderated Available" ? "Moderated Main" : "Available Main",
        atktusedstatus: targetStatus === "Moderated Available" ? "Moderated ATKT" : "Available Suppl.",
        stockmonthyear: text(options.stockmonthyear) || `${new Date().toLocaleString('en-us', { month: 'short' })}-${String(new Date().getFullYear()).slice(-2)}`,
        stockmonth: new Date().toLocaleString('en-us', { month: 'short' }),
        stockyear: String(new Date().getFullYear()),
        contactnumber: text(paperDoc.contactnumber),
        email: text(paperDoc.papersetteremail || paperDoc.email),
        user: text(paperDoc.user || options.user)
      });
    } else {
      stock.status = targetStatus;
      if (targetStatus === "Moderated Available") {
        if (!stock.mainusedstatus || stock.mainusedstatus === " -" || stock.mainusedstatus === "Available Main") {
          stock.mainusedstatus = "Moderated Main";
        }
        if (!stock.atktusedstatus || stock.atktusedstatus === " -" || stock.atktusedstatus === "Available Suppl.") {
          stock.atktusedstatus = "Moderated ATKT";
        }
      }
      if (paperDoc.papersettername) stock.papersettername = text(paperDoc.papersettername);
      if (paperDoc.papername) stock.papername = text(paperDoc.papername);
      if (options.submissionmode) stock.submissionmode = text(options.submissionmode);
    }

    await stock.save();
    return stock;
  } catch (err) {
    console.error("[syncPaperToStock] error:", err.message);
    return null;
  }
};
