const mongoose = require("mongoose");

const conductExamStockTransactionSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true },
    academicyear: { type: String, trim: true, default: "2026-27" },
    stockentryId: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamstockentryds" },
    itemname: { type: String, required: true, trim: true },
    type: { type: String, enum: ["ISSUE", "RECEIVE"], required: true },
    institute: { type: String, required: true, trim: true },
    hos: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true, default: () => new Date().toISOString().slice(0, 10) },
    towhom: { type: String, trim: true, default: "" },
    srno_from: { type: String, trim: true, default: "" },
    srno_to: { type: String, trim: true, default: "" },
    totalitems: { type: Number, required: true, min: 1 },
    remarks: { type: String, trim: true, default: "" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamStockTransactionSchema.index({ colid: 1, itemname: 1, type: 1, date: 1 });

module.exports = mongoose.model("conductexamstocktransactionds", conductExamStockTransactionSchema);
