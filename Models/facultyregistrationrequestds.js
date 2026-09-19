const mongoose = require("mongoose");

const employmentRecordSchema = new mongoose.Schema(
  {
    designation: { type: String, trim: true, default: "" },
    institution: { type: String, trim: true, default: "" },
    dateofjoining: { type: String, trim: true, default: "" },
    dateofexit: { type: String, trim: true, default: "" },
    medicalcouncilid: { type: String, trim: true, default: "" },
    specialization: { type: String, trim: true, default: "" },
    subjectstaught: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const facultyRegistrationRequestSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    linktoken: { type: String, trim: true, default: "" },
    facultytype: { type: String, trim: true, required: true },
    valuatortype: { type: String, trim: true, required: true },
    gender: { type: String, trim: true, required: true },
    fullname: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true, index: true },
    mobile: { type: String, trim: true, required: true },
    alternatemobile: { type: String, trim: true, default: "" },
    teachingexperience_years: { type: Number, default: 0 },
    teachingexperience_months: { type: Number, default: 0 },
    photolink: { type: String, trim: true, default: "" },
    signaturelink: { type: String, trim: true, default: "" },

    // Faculty Employment Profile
    currentemployment: {
      type: employmentRecordSchema,
      default: () => ({})
    },
    pastemployment: {
      type: [employmentRecordSchema],
      default: []
    },

    // Bank Details
    accountnumber: { type: String, trim: true, default: "" },
    accountholdername: { type: String, trim: true, default: "" },
    bankname: { type: String, trim: true, default: "" },
    ifsccode: { type: String, trim: true, uppercase: true, default: "" },
    branchname: { type: String, trim: true, default: "" },
    pancardnumber: { type: String, trim: true, uppercase: true, default: "" },
    pancardlink: { type: String, trim: true, default: "" },

    // Review & Approval Lifecycle
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Hold"],
      default: "Pending",
      index: true
    },
    adminremarks: { type: String, trim: true, default: "" },
    actionby: { type: String, trim: true, default: "" },
    actiondate: { type: Date },
    createduserid: { type: String, trim: true, default: "" },
    mailsent: { type: Boolean, default: false },
    mailerror: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.facultyregistrationrequestds ||
  mongoose.model("facultyregistrationrequestds", facultyRegistrationRequestSchema);
