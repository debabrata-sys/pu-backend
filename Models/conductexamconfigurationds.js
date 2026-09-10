const mongoose = require("mongoose");

const ConductExamConfigurationSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    institutionname: { type: String, default: "" },
    affiliatedboard: { type: String, default: "" },
    address: { type: String, default: "" },
    coename: { type: String, default: "" },
    coetitle: { type: String, default: "Controller of Examinations" },
    vcname: { type: String, default: "" },
    vctitle: { type: String, default: "Vice Chancellor" },
    logo: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    website: { type: String, default: "" },
    createdby: { type: String, default: "" },
    updatedby: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "conductexamconfiguration",
  ConductExamConfigurationSchema
);
