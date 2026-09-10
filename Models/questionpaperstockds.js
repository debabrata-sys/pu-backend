const mongoose = require("mongoose");

const questionPaperStockSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, required: true, trim: true },
  sno: { type: Number, default: 0 },
  papercode: { type: String, trim: true, default: "" },
  papername: { type: String, required: true, trim: true },
  papersettername: { type: String, trim: true, default: "" },
  papercategory: { type: String, trim: true, default: "" },          // A / B / C
  address: { type: String, trim: true, default: "" },
  mainusedstatus: { type: String, trim: true, default: "" },         // e.g. "Used in Exam Sep, 2020" or "Unused"
  atktusedstatus: { type: String, trim: true, default: "" },         // e.g. "Used in Exam March, 2023" or "Unused"
  stockmonthyear: { type: String, trim: true, default: "" },         // e.g. "Jan-22"
  contactnumber: { type: String, trim: true, default: "" },
  submissionmode: { type: String, trim: true, default: "" },         // Hard Copy / Soft Copy / Both
  examinercode: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, default: "" },
  papertype: { type: String, trim: true, default: "" },             // Main / ATKT
  status: { type: String, trim: true, default: "Available in soft copy" }, // Available in soft copy / Moderated Main / Moderated ATKT
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

questionPaperStockSchema.index(
  { colid: 1, academicyear: 1, program: 1, semester: 1, papercode: 1 },
  { unique: false }
);

module.exports = mongoose.model("questionpaperstockds", questionPaperStockSchema);
