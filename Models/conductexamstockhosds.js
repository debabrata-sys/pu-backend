const mongoose = require("mongoose");

const conductExamStockHosSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true },
    hosname: { type: String, required: true, trim: true },
    hoscode: { type: String, required: true, trim: true },
    department: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamStockHosSchema.index({ colid: 1, hoscode: 1 }, { unique: true });

module.exports = mongoose.model("conductexamstockhosds", conductExamStockHosSchema);
