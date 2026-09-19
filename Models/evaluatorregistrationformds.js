const mongoose = require("mongoose");

const dynamicFieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    fieldname: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: ["user_model", "custom_field"],
      default: "user_model"
    },
    type: {
      type: String,
      enum: ["text", "number", "email", "select", "date", "textarea", "file", "yes/no"],
      default: "text"
    },
    options: {
      type: [String],
      default: []
    },
    required: {
      type: Boolean,
      default: false
    },
    section: {
      type: String,
      trim: true,
      default: "General Information"
    },
    order: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const evaluatorRegistrationFormSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    title: { type: String, trim: true, default: "Evaluator / Faculty Registration" },
    description: { type: String, trim: true, default: "" },
    token: { type: String, required: true, unique: true, index: true },
    role: { type: String, trim: true, default: "Faculty" },
    department: { type: String, trim: true, default: "" },

    // Dynamic fields configured by Admin
    fields: {
      type: [dynamicFieldSchema],
      default: []
    },

    // Optional modular sections
    includeBankDetails: { type: Boolean, default: true },
    includeSignature: { type: Boolean, default: true },
    includePhoto: { type: Boolean, default: true },

    validuntil: { type: Date },
    maxsubmissions: { type: Number, default: 0 }, // 0 = unlimited
    submissioncount: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active", index: true },

    createdby: { type: String, trim: true },
    createdname: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.evaluatorregistrationformds ||
  mongoose.model("evaluatorregistrationformds", evaluatorRegistrationFormSchema);
