const mongoose = require("mongoose");

const conductExamExaminerSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  type: { type: String, trim: true, default: "" },
  subject: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  course: { type: String, required: true, trim: true },
  coursecode: { type: String, required: true, trim: true },
  examinername: { type: String, required: true, trim: true },
  examineremail: { type: String, required: true, trim: true },
  examinercode: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" },
  acceptancestatus: { type: String, trim: true, default: "Pending" },
  acceptancedate: { type: Date },
  acceptancedata: { type: Object, default: {} },
  bankdetails: { type: Object, default: {} },
  declarationstatus: { type: String, trim: true, default: "Pending" },
  declarationdate: { type: Date },
  declarationdata: { type: Object, default: {} },
  billstatus: { type: String, trim: true, default: "Draft" },
  billdata: { type: Object, default: {} }
}, { timestamps: true });

conductExamExaminerSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  coursecode: 1,
  examineremail: 1
}, { unique: true });

module.exports = mongoose.model("conductexamexaminer2ds", conductExamExaminerSchema);
