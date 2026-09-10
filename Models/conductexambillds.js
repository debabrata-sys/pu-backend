const mongoose = require("mongoose");

const assignmentItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  count: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 }
}, { _id: false });

const travelItemSchema = new mongoose.Schema({
  date: { type: String, trim: true, default: "" },
  from: { type: String, trim: true, default: "" },
  to: { type: String, trim: true, default: "" },
  mode: { type: String, trim: true, default: "" },
  amount: { type: Number, default: 0 }
}, { _id: false });

const conductExamBillSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    billno: { type: String, required: true, trim: true, unique: true },
    vno: { type: String, trim: true, default: "" }, // Voucher No
    billdate: { type: String, trim: true, default: "" },

    // Staff details
    examinerid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamremunerationds" },
    examinername: { type: String, required: true, trim: true },
    examineremail: { type: String, required: true, trim: true },
    designation: { type: String, trim: true, default: "" },
    instituteaddress: { type: String, trim: true, default: "" },
    contactno: { type: String, trim: true, default: "" },
    qualification: { type: String, trim: true, default: "" },
    specialization: { type: String, trim: true, default: "" },
    experience_ug: { type: String, trim: true, default: "0" },
    experience_pg: { type: String, trim: true, default: "0" },

    rolecategory: { type: String, required: true, trim: true }, // Evaluator, Paper Setter, Moderator, Invigilator
    stafftype: { type: String, required: true, trim: true }, // Internal, External

    // Exam / Academic mapping
    academicyear: { type: String, trim: true, default: "" },
    regulation: { type: String, trim: true, default: "" },
    exam: { type: String, trim: true, default: "" },
    examcode: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    semester: { type: String, trim: true, default: "" },
    examtype: { type: String, trim: true, default: "Main" },
    papercode: { type: String, trim: true, default: "" },
    papername: { type: String, trim: true, default: "" },
    examdate: { type: String, trim: true, default: "" },

    // Assignment & traveling breakdown
    assignments: [assignmentItemSchema],
    travelDetails: [travelItemSchema],

    assignmentTotal: { type: Number, default: 0 },
    travelTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    grandTotalWords: { type: String, trim: true, default: "" },

    // RTGS / NEFT Bank Details
    bankname: { type: String, trim: true, default: "" },
    bankbranch: { type: String, trim: true, default: "" },
    accountno: { type: String, trim: true, default: "" },
    ifsccode: { type: String, trim: true, default: "" },
    panno: { type: String, trim: true, default: "" },

    // Payment Eligibility Flag & Reason
    isPayable: { type: Boolean, default: true },
    nonPayableReason: { type: String, trim: true, default: "" },

    // Approval / Sanction tracking (matching Page 2 of official form)
    hodVerification: { type: String, trim: true, default: "" },
    hoiVerification: { type: String, trim: true, default: "" },
    inchargeVerification: { type: String, trim: true, default: "" },
    coeApproval: { type: String, trim: true, default: "" },
    cfaoPassAmount: { type: Number, default: 0 },
    cfaoPassAmountWords: { type: String, trim: true, default: "" },

    // Cashier / Settlement info
    paymentMode: { type: String, trim: true, default: "RTGS/NEFT" }, // RTGS/NEFT, Cheque, Cash
    chequeno: { type: String, trim: true, default: "" },
    paymentdate: { type: String, trim: true, default: "" },
    paymentbank: { type: String, trim: true, default: "" },
    cashierName: { type: String, trim: true, default: "" },
    accountantName: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["Draft", "Submitted", "Verified", "Passed For Payment", "Paid"],
      default: "Submitted"
    },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamBillSchema.index({ colid: 1, billno: 1 });
conductExamBillSchema.index({ colid: 1, examineremail: 1, papercode: 1 });

module.exports = mongoose.model("conductexambillds", conductExamBillSchema);
