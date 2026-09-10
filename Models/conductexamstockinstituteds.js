const mongoose = require("mongoose");

const conductExamStockInstituteSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true },
    institutename: { type: String, required: true, trim: true },
    institutecode: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamStockInstituteSchema.index({ colid: 1, institutecode: 1 }, { unique: true });

module.exports = mongoose.model("conductexamstockinstituteds", conductExamStockInstituteSchema);
