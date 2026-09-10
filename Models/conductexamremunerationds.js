const mongoose = require("mongoose");

const conductExamRemunerationSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    regulation: { type: String, trim: true, default: "" },
    exam: { type: String, trim: true, default: "" },
    examcode: { type: String, required: true, trim: true },
    program: { type: String, required: true, trim: true },
    programcode: { type: String, required: true, trim: true },
    department: { type: String, trim: true, default: "" },
    semester: { type: String, trim: true, default: "" },
    examtype: { type: String, trim: true, default: "Main" }, // Main, Suppl., ATKT, Regular
    type: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    course: { type: String, required: true, trim: true },
    coursecode: { type: String, required: true, trim: true },
    papername: { type: String, trim: true, default: "" },
    papercode: { type: String, trim: true, default: "" },
    examdate: { type: String, trim: true, default: "" },

    // Staff / Examiner Details
    examinername: { type: String, required: true, trim: true },
    examineremail: { type: String, required: true, trim: true },
    designation: { type: String, trim: true, default: "" },
    instituteaddress: { type: String, trim: true, default: "" },
    contactno: { type: String, trim: true, default: "" },
    qualification: { type: String, trim: true, default: "" },
    specialization: { type: String, trim: true, default: "" },
    experience_ug: { type: String, trim: true, default: "0" },
    experience_pg: { type: String, trim: true, default: "0" },

    // Role sub-category: Evaluator, Paper Setter, Moderator, Invigilator
    rolecategory: {
      type: String,
      required: true,
      enum: ["Evaluator", "Paper Setter", "Moderator", "Invigilator"],
      default: "Evaluator"
    },

    // Staff Type: Internal or External
    stafftype: {
      type: String,
      required: true,
      enum: ["Internal", "External"],
      default: "External"
    },

    // Bank Details for RTGS/NEFT Fund Transfer
    bankname: { type: String, trim: true, default: "" },
    bankbranch: { type: String, trim: true, default: "" },
    accountno: { type: String, trim: true, default: "" },
    ifsccode: { type: String, trim: true, default: "" },
    panno: { type: String, trim: true, default: "" },

    // Counts & rates if customized per registration
    assignedcount: { type: Number, default: 0 },
    customrate: { type: Number, default: 0 },

    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamRemunerationSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  coursecode: 1,
  rolecategory: 1,
  examineremail: 1
});

module.exports = mongoose.model("conductexamremunerationds", conductExamRemunerationSchema);
