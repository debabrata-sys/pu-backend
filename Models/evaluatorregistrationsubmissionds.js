const mongoose = require("mongoose");

const bankDetailsSchema = new mongoose.Schema(
  {
    bankname: { type: String, trim: true, default: "" },
    branchname: { type: String, trim: true, default: "" },
    accountholdername: { type: String, trim: true, default: "" },
    accountnumber: { type: String, trim: true, default: "" },
    ifsccode: { type: String, trim: true, uppercase: true, default: "" },
    pancardnumber: { type: String, trim: true, uppercase: true, default: "" }
  },
  { _id: false }
);

const evaluatorRegistrationSubmissionSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    formid: { type: mongoose.Schema.Types.ObjectId, ref: "evaluatorregistrationformds", required: true, index: true },
    formtoken: { type: String, trim: true, default: "" },
    formtitle: { type: String, trim: true, default: "" },

    // Primary applicant identifiers
    fullname: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true, index: true },
    mobile: { type: String, trim: true, required: true },
    role: { type: String, trim: true, default: "Faculty" },

    // Dynamic field values (all fields submitted by applicant)
    fieldValues: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },

    // Custom fields map (for easy syncing with User.customFields)
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },

    // Uploaded attachments
    photolink: { type: String, trim: true, default: "" },
    signaturelink: { type: String, trim: true, default: "" },
    documentlinks: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },

    // Bank Details
    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({})
    },

    // Review & Approval Status
    status: {
      type: String,
      enum: ["Pending", "Approved", "Hold", "Rejected"],
      default: "Pending",
      index: true
    },
    adminremarks: { type: String, trim: true, default: "" },
    actionby: { type: String, trim: true, default: "" },
    actiondate: { type: Date },

    // Post-approval credentials
    createduserid: { type: String, trim: true, default: "" },
    mailsent: { type: Boolean, default: false },
    mailerror: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.evaluatorregistrationsubmissionds ||
  mongoose.model("evaluatorregistrationsubmissionds", evaluatorRegistrationSubmissionSchema);
