const mongoose = require("mongoose");

const conductExamOnScreenMarkSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    subject: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, required: true, trim: true },
    coursecode: { type: String, required: true, trim: true },
    paperid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamquestionpaper2ds", required: true, index: true },
    sectionid: { type: String, required: true, trim: true },
    section: { type: String, trim: true },
    questionid: { type: String, required: true, trim: true },
    question: { type: String, trim: true },
    maxmarks: { type: Number, default: 0 },
    marks: { type: Number, default: 0 },
    student: { type: String, required: true, trim: true },
    regno: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    examinername: { type: String, trim: true },
    examineremail: { type: String, trim: true },
    valuationtype: { type: String, default: "V1", trim: true }, // V1, V2, V3, V4
    finalized: { type: String, trim: true, default: "No" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamOnScreenMarkSchema.index({ colid: 1, paperid: 1, regno: 1, questionid: 1, valuationtype: 1 }, { unique: true });

module.exports = mongoose.model("conductexamonscreenmark2ds", conductExamOnScreenMarkSchema);
