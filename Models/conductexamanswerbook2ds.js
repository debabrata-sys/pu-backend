const mongoose = require("mongoose");

const conductExamAnswerBook2Schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, required: true, trim: true },
  type: { type: String, trim: true },
  subject: { type: String, trim: true },
  semester: { type: String, trim: true },
  course: { type: String, required: true, trim: true },
  coursecode: { type: String, required: true, trim: true },
  student: { type: String, required: true, trim: true },
  regno: { type: String, required: true, trim: true, index: true },
  cn: { type: String, trim: true, default: "" },
  seatno: { type: String, trim: true },
  examdate: { type: String, trim: true },
  examslot: { type: String, trim: true },
  examroom: { type: String, trim: true },
  campus: { type: String, trim: true },
  building: { type: String, trim: true },
  answerbookurl: { type: String, required: true, trim: true },
  answerbookfilename: { type: String, trim: true },
  answerbookkey: { type: String, trim: true },
  filesize: { type: Number, default: 0 },
  mimetype: { type: String, trim: true },
  pagescount: { type: Number, default: 0 },
  uploadstatus: { type: String, enum: ["Uploaded", "Verified", "Pending"], default: "Uploaded" },
  uploaddate: { type: Date, default: Date.now },
  user: { type: String, trim: true },
  remarks: { type: String, trim: true }
}, { timestamps: true });

conductExamAnswerBook2Schema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  coursecode: 1,
  regno: 1
}, { unique: true });

module.exports = mongoose.model("conductexamanswerbook2ds", conductExamAnswerBook2Schema);
