const mongoose = require("mongoose");

const facultyRegistrationLinkSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    title: { type: String, trim: true, default: "Faculty & Valuator Registration" },
    token: { type: String, required: true, unique: true, index: true },
    role: { type: String, trim: true, default: "Faculty" },
    department: { type: String, trim: true, default: "" },
    facultytype: { type: String, trim: true, default: "" },
    valuatortype: { type: String, trim: true, default: "" },
    validuntil: { type: Date },
    maxsubmissions: { type: Number, default: 0 }, // 0 = unlimited
    submissioncount: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    url: { type: String, trim: true },
    createdby: { type: String, trim: true },
    createdname: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.facultyregistrationlinkds || mongoose.model("facultyregistrationlinkds", facultyRegistrationLinkSchema);
