const mongoose = require("mongoose");

const conductExamStockEntrySchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true },
    academicyear: { type: String, trim: true, default: "2026-27" },
    itemname: { type: String, required: true, trim: true },
    srno_from: { type: String, trim: true, default: "" },
    srno_to: { type: String, trim: true, default: "" },
    totalitems: { type: Number, required: true, min: 0 },
    issueditems: { type: Number, default: 0, min: 0 },
    receiveditems: { type: Number, default: 0, min: 0 },
    currentbalance: { type: Number, default: 0 },
    institute: { type: String, trim: true, default: "" },
    hos: { type: String, trim: true, default: "" },
    entrydate: { type: String, trim: true, default: () => new Date().toISOString().slice(0, 10) },
    remarks: { type: String, trim: true, default: "" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamStockEntrySchema.index({ colid: 1, itemname: 1, academicyear: 1 });

module.exports = mongoose.model("conductexamstockentryds", conductExamStockEntrySchema);
