const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");

const EvaluatorRegistrationForm = require("../Models/evaluatorregistrationformds");
const EvaluatorRegistrationSubmission = require("../Models/evaluatorregistrationsubmissionds");
const User = require("../Models/user");
const UserCustomField = require("../Models/usercustomfieldds");
const UserBankAccount = require("../Models/userbankaccountds");
const UserSignature = require("../Models/usersignatureds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const Institution = require("../Models/institutions");

// -------------------------------------------------------------
// Upload Storage Configuration
// -------------------------------------------------------------
const uploadDir = path.join(__dirname, "..", "public", "uploads", "evaluator_registrations");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, "_")
      .slice(0, 30);
    const unique = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    cb(null, `${cleanBase}_${unique}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return cb(new Error("Only .jpg, .jpeg, .png, .gif, .pdf, and .webp files are allowed"), false);
  }
  cb(null, true);
};

exports.uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2 MB
}).single("file");

// -------------------------------------------------------------
// Helper: Institution Data
// -------------------------------------------------------------
const getInstitutionData = async (colid) => {
  try {
    const ins = await Institution.findOne({ colid: Number(colid) }).lean();
    if (ins) {
      return {
        institutionname: ins.institutionname || "University Portal",
        institutioncode: ins.institutioncode || "PU",
        logo: ins.logo || ""
      };
    }
  } catch (err) {
    console.error("Error fetching institution:", err.message);
  }
  return {
    institutionname: "University Portal",
    institutioncode: "PU",
    logo: ""
  };
};

// -------------------------------------------------------------
// Helper: Welcome Email
// -------------------------------------------------------------
const getActiveEmailConfig = async (colid) => {
  try {
    const activeQuery = { colid: Number(colid), isactive: /^yes$/i };
    return (
      (await EmailConfiguration.findOne({ ...activeQuery, default: /^yes$/i }).sort({ updatedAt: -1 }).lean()) ||
      (await EmailConfiguration.findOne(activeQuery).sort({ updatedAt: -1 }).lean())
    );
  } catch {
    return null;
  }
};

const sendWelcomeEmail = async ({ colid, recipientEmail, recipientName, password, institutionName }) => {
  try {
    const config = await getActiveEmailConfig(colid);
    if (!config?.username || !config?.password) {
      return { sent: false, error: "Email configuration not found or inactive" };
    }

    const port = Number(config.port || 587);
    const host = config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");
    if (!host) {
      return { sent: false, error: "SMTP host not configured" };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: config.username, pass: config.password },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000
    });

    const appUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const subject = `Welcome to ${institutionName} - Login Credentials`;
    const text = `Dear ${recipientName},\n\nYour registration has been approved. Your login credentials are:\n\nPortal: ${appUrl}\nUsername / User ID: ${recipientEmail}\nPassword: ${password}\n\nPlease change your password upon your first login.\n\nBest regards,\n${institutionName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a365d; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px;">${institutionName}</h2>
        <p>Dear <b>${recipientName}</b>,</p>
        <p>Your self-registration application has been <b>approved</b> by the administration. Your login account has been successfully created.</p>
        
        <div style="background-color: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><b>Login Portal:</b> <a href="${appUrl}">${appUrl}</a></p>
          <p style="margin: 4px 0;"><b>User ID (Email):</b> <code>${recipientEmail}</code></p>
          <p style="margin: 4px 0;"><b>Temporary Password:</b> <code>${password}</code></p>
        </div>

        <p style="color: #4a5568;">Please keep these credentials secure. You may update your password once logged in.</p>
        <p style="font-size: 12px; color: #718096; margin-top: 30px;">This is an automated notification. Please do not reply directly to this email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"${institutionName}" <${config.username}>`,
      to: recipientEmail,
      subject,
      text,
      html
    });

    return { sent: true };
  } catch (err) {
    console.error("sendWelcomeEmail error:", err.message);
    return { sent: false, error: err.message };
  }
};

// =============================================================
// API 1: User Model Fields Catalog (Default + Selectable)
// =============================================================
exports.getUserModelCatalog = (req, res) => {
  // Core required fields - included by default on every new form
  const coreDefaultFields = [
    { id: "core_name", fieldname: "name", label: "Full Name", source: "user_model", type: "text", required: true, section: "Personal Information", order: 1, isDefault: true },
    { id: "core_email", fieldname: "email", label: "Email ID (Login Username)", source: "user_model", type: "email", required: true, section: "Contact Information", order: 2, isDefault: true },
    { id: "core_phone", fieldname: "phone", label: "Mobile Number", source: "user_model", type: "text", required: true, section: "Contact Information", order: 3, isDefault: true },
    { id: "core_role", fieldname: "role", label: "Role", source: "user_model", type: "select", options: ["Faculty", "Evaluator", "Chief Evaluator", "Moderator"], required: true, section: "Professional Information", order: 4, isDefault: true },
    { id: "core_gender", fieldname: "gender", label: "Gender", source: "user_model", type: "select", options: ["Male", "Female", "Other"], required: true, section: "Personal Information", order: 5, isDefault: true }
  ];

  // Additional selectable User model fields that can be added dynamically
  const availableUserModelFields = [
    { fieldname: "department", label: "Department", source: "user_model", type: "text", section: "Academic Information" },
    { fieldname: "designation", label: "Designation", source: "user_model", type: "text", section: "Professional Information" },
    { fieldname: "dob", label: "Date of Birth", source: "user_model", type: "date", section: "Personal Information" },
    { fieldname: "address", label: "Address", source: "user_model", type: "textarea", section: "Contact Information" },
    { fieldname: "city", label: "City", source: "user_model", type: "text", section: "Contact Information" },
    { fieldname: "district", label: "District", source: "user_model", type: "text", section: "Contact Information" },
    { fieldname: "state", label: "State", source: "user_model", type: "text", section: "Contact Information" },
    { fieldname: "pincode", label: "Pincode", source: "user_model", type: "text", section: "Contact Information" },
    { fieldname: "bloodgroup", label: "Blood Group", source: "user_model", type: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], section: "Personal Information" },
    { fieldname: "qualification", label: "Highest Qualification", source: "user_model", type: "text", section: "Academic Information" },
    { fieldname: "fathername", label: "Father's Name", source: "user_model", type: "text", section: "Personal Information" },
    { fieldname: "mothername", label: "Mother's Name", source: "user_model", type: "text", section: "Personal Information" },
    { fieldname: "nationality", label: "Nationality", source: "user_model", type: "text", section: "Personal Information" },
    { fieldname: "category", label: "Category", source: "user_model", type: "select", options: ["General", "OBC", "SC", "ST", "EWS"], section: "Personal Information" },
    { fieldname: "maritalstatus", label: "Marital Status", source: "user_model", type: "select", options: ["Single", "Married", "Other"], section: "Personal Information" },
    { fieldname: "emergencycontact", label: "Emergency Contact", source: "user_model", type: "text", section: "Contact Information" },
    { fieldname: "pan", label: "PAN Card Number", source: "user_model", type: "text", section: "KYC Details" },
    { fieldname: "aadhaar", label: "Aadhaar Number", source: "user_model", type: "text", section: "KYC Details" },
    { fieldname: "dateofjoining", label: "Date of Joining", source: "user_model", type: "date", section: "Professional Information" }
  ];

  return res.status(200).json({
    status: "Success",
    coreDefaultFields,
    availableUserModelFields,
    data: {
      essential: coreDefaultFields,
      optional: availableUserModelFields
    }
  });
};

// =============================================================
// API 2: Get Existing Custom Fields for Institution
// =============================================================
exports.getCustomFieldsCatalog = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const customFields = await UserCustomField.find({ colid, isactive: "Yes" }).sort({ order: 1, label: 1 }).lean();
    return res.status(200).json({
      status: "Success",
      data: customFields
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 3: Create a Custom Field On the Fly
// =============================================================
exports.createCustomField = async (req, res) => {
  try {
    const { colid, fieldname, label, type, options, isrequired, section, user } = req.body;
    if (!colid || !fieldname || !label) {
      return res.status(400).json({ status: "Error", message: "colid, fieldname, and label are required" });
    }

    const cleanFieldname = String(fieldname).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const optionsArray = Array.isArray(options)
      ? options
      : String(options || "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean);

    const customField = await UserCustomField.findOneAndUpdate(
      { colid: Number(colid), fieldname: cleanFieldname },
      {
        colid: Number(colid),
        fieldname: cleanFieldname,
        label: String(label).trim(),
        type: type || "text",
        options: optionsArray,
        isrequired: isrequired === "Yes" || isrequired === true ? "Yes" : "No",
        section: section || "Custom Fields",
        isactive: "Yes",
        user: user || "Admin"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      status: "Success",
      message: "Custom field created successfully",
      data: customField
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 4: Get All Registration Forms
// =============================================================
exports.getForms = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const forms = await EvaluatorRegistrationForm.find({ colid }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({
      status: "Success",
      data: forms
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 5: Save (Create / Update) Dynamic Registration Form
// =============================================================
exports.saveForm = async (req, res) => {
  try {
    const { id, colid, title, description, role, department, fields, includeBankDetails, includeSignature, includePhoto, validuntil, maxsubmissions, status, user } = req.body;

    if (!colid || !title) {
      return res.status(400).json({ status: "Error", message: "colid and title are required" });
    }

    let form;
    if (id) {
      form = await EvaluatorRegistrationForm.findOne({ _id: id, colid: Number(colid) });
      if (!form) return res.status(404).json({ status: "Error", message: "Form not found" });
    } else {
      const token = `reg_${crypto.randomBytes(6).toString("hex")}`;
      form = new EvaluatorRegistrationForm({
        colid: Number(colid),
        token,
        createdby: user || "Admin"
      });
    }

    form.title = String(title).trim();
    form.description = String(description || "").trim();
    form.role = role || "Faculty";
    form.department = department || "";
    form.fields = Array.isArray(fields) ? fields : [];
    form.includeBankDetails = includeBankDetails !== false;
    form.includeSignature = includeSignature !== false;
    form.includePhoto = includePhoto !== false;
    form.validuntil = validuntil ? new Date(validuntil) : null;
    form.maxsubmissions = Number(maxsubmissions) || 0;
    form.status = status || "Active";

    await form.save();

    return res.status(200).json({
      status: "Success",
      message: id ? "Form updated successfully" : "Registration form and link created successfully",
      data: form
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 6: Delete / Toggle Status of Form
// =============================================================
exports.deleteForm = async (req, res) => {
  try {
    const { id, colid } = req.body;
    await EvaluatorRegistrationForm.findOneAndDelete({ _id: id, colid: Number(colid) });
    return res.status(200).json({ status: "Success", message: "Form deleted successfully" });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 7: Public File Upload (Photo, Signature, Documents)
// =============================================================
exports.uploadPublicFile = (req, res) => {
  exports.uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ status: "Error", message: "File size exceeds 2 MB limit." });
      }
      return res.status(400).json({ status: "Error", message: err.message || "File upload failed." });
    }

    if (!req.file) {
      return res.status(400).json({ status: "Error", message: "No file was uploaded." });
    }

    const fileUrl = `/uploads/evaluator_registrations/${req.file.filename}`;
    return res.status(200).json({
      status: "Success",
      url: fileUrl,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
};

// =============================================================
// API 8: Public Get Form Definition (by Token or colid)
// =============================================================
exports.getPublicForm = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const token = String(req.query.token || "").trim();

    let form = null;
    if (token) {
      form = await EvaluatorRegistrationForm.findOne({ token, colid }).lean();
    } else {
      // Fallback: load latest active form for colid
      form = await EvaluatorRegistrationForm.findOne({ colid, status: "Active" }).sort({ createdAt: -1 }).lean();
    }

    if (!form) {
      return res.status(404).json({
        status: "Error",
        message: "No active registration form found for this link or institution."
      });
    }

    if (form.status !== "Active") {
      return res.status(400).json({ status: "Error", message: "This registration form is currently inactive." });
    }

    if (form.validuntil && new Date() > new Date(form.validuntil)) {
      return res.status(400).json({ status: "Error", message: "This registration link has expired." });
    }

    if (form.maxsubmissions > 0 && form.submissioncount >= form.maxsubmissions) {
      return res.status(400).json({ status: "Error", message: "Maximum submissions limit reached for this form." });
    }

    const institution = await getInstitutionData(colid);

    return res.status(200).json({
      status: "Success",
      colid,
      institution,
      data: form,
      form
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 9: Public Submit Registration
// =============================================================
exports.submitPublicRegistration = async (req, res) => {
  try {
    const colid = Number(req.body.colid || req.query.colid) || 1;
    const token = String(req.body.token || req.body.formtoken || req.query.token || "").trim();
    const { fieldValues = {}, customFields = {}, bankDetails = {}, photolink, signaturelink, documentlinks = {} } = req.body;

    if (!colid || (!token && !req.body.formid)) {
      return res.status(400).json({ status: "Error", message: "colid and token are required" });
    }

    let form = null;
    if (token) {
      form = await EvaluatorRegistrationForm.findOne({ token, colid });
    }
    if (!form && req.body.formid) {
      form = await EvaluatorRegistrationForm.findOne({ _id: req.body.formid, colid });
    }
    if (!form) {
      return res.status(404).json({ status: "Error", message: "Registration form not found or link is invalid" });
    }

    if (form.status !== "Active") {
      return res.status(400).json({ status: "Error", message: "This registration link is currently inactive." });
    }

    if (form.validuntil && new Date() > new Date(form.validuntil)) {
      return res.status(400).json({ status: "Error", message: "This registration link has expired." });
    }

    // Extract essential identifiers from fieldValues or top-level body
    const fullname = String(fieldValues.name || req.body.fullname || req.body.name || "").trim();
    const email = String(fieldValues.email || req.body.email || "").trim().toLowerCase();
    const mobile = String(fieldValues.phone || req.body.mobile || req.body.phone || "").trim();
    const role = String(fieldValues.role || form.role || "Faculty").trim();

    if (!fullname || !email || !mobile) {
      return res.status(400).json({
        status: "Error",
        message: "Full Name, Email ID, and Mobile Number are required"
      });
    }

    // Check mandatory fields defined in form.fields
    for (const f of form.fields || []) {
      if (f.required) {
        const val = fieldValues[f.fieldname] ?? customFields[f.fieldname];
        if (val === undefined || val === null || String(val).trim() === "") {
          return res.status(400).json({
            status: "Error",
            message: `${f.label || f.fieldname} is required.`
          });
        }
      }
    }

    // Check if duplicate pending application
    const existingPending = await EvaluatorRegistrationSubmission.findOne({
      colid: Number(colid),
      email,
      status: "Pending"
    });
    if (existingPending) {
      return res.status(400).json({
        status: "Error",
        message: "An application with this email ID is already pending review."
      });
    }

    // Merge custom field values
    const mergedCustomFields = { ...customFields };
    (form.fields || []).forEach((f) => {
      if (f.source === "custom_field" && fieldValues[f.fieldname] !== undefined) {
        mergedCustomFields[f.fieldname] = fieldValues[f.fieldname];
      }
    });

    const submission = new EvaluatorRegistrationSubmission({
      colid: Number(colid),
      formid: form._id,
      formtoken: form.token,
      formtitle: form.title,
      fullname,
      email,
      mobile,
      role,
      fieldValues,
      customFields: mergedCustomFields,
      photolink: photolink || "",
      signaturelink: signaturelink || "",
      documentlinks,
      bankDetails: bankDetails || {},
      status: "Pending"
    });

    await submission.save();

    // Increment submission count
    form.submissioncount = (form.submissioncount || 0) + 1;
    await form.save();

    return res.status(200).json({
      status: "Success",
      message: "Registration submitted successfully! Your application is pending review by the administration.",
      submissionId: submission._id
    });
  } catch (err) {
    console.error("submitPublicRegistration error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 10: Admin Get Submissions List
// =============================================================
exports.getSubmissions = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const { status, formid, search } = req.query;

    const query = { colid };
    if (status && status !== "All") query.status = status;
    if (formid) query.formid = formid;
    if (search) {
      const q = String(search).trim();
      query.$or = [
        { fullname: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { mobile: { $regex: q, $options: "i" } }
      ];
    }

    const submissions = await EvaluatorRegistrationSubmission.find(query).sort({ createdAt: -1 }).lean();

    const normalizedSubmissions = submissions.map((sub) => ({
      ...sub,
      applicantName: sub.applicantName || sub.fullname || sub.fieldValues?.name || "",
      applicantEmail: sub.applicantEmail || sub.email || sub.fieldValues?.email || "",
      applicantPhone: sub.applicantPhone || sub.mobile || sub.fieldValues?.phone || "",
      applicantRole: sub.applicantRole || sub.role || "Faculty",
      formTitle: sub.formTitle || sub.formtitle || "Evaluator Registration"
    }));

    // Summary counts
    const allColidSubmissions = await EvaluatorRegistrationSubmission.find({ colid }).select("status").lean();
    const summary = {
      total: allColidSubmissions.length,
      pending: allColidSubmissions.filter((s) => s.status === "Pending").length,
      approved: allColidSubmissions.filter((s) => s.status === "Approved").length,
      hold: allColidSubmissions.filter((s) => s.status === "Hold").length,
      rejected: allColidSubmissions.filter((s) => s.status === "Rejected").length
    };

    return res.status(200).json({
      status: "Success",
      data: normalizedSubmissions,
      summary,
      stats: summary
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 11: Admin Get Single Submission Details
// =============================================================
exports.getSubmissionDetails = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const { id } = req.query;

    let submission = (await EvaluatorRegistrationSubmission.findOne({ _id: id, colid }).lean())
      || (await EvaluatorRegistrationSubmission.findById(id).lean());
    if (!submission) {
      return res.status(404).json({ status: "Error", message: "Submission not found" });
    }

    submission = {
      ...submission,
      applicantName: submission.applicantName || submission.fullname || submission.fieldValues?.name || "",
      applicantEmail: submission.applicantEmail || submission.email || submission.fieldValues?.email || "",
      applicantPhone: submission.applicantPhone || submission.mobile || submission.fieldValues?.phone || "",
      applicantRole: submission.applicantRole || submission.role || "Faculty",
      formTitle: submission.formTitle || submission.formtitle || "Evaluator Registration"
    };

    const form = await EvaluatorRegistrationForm.findById(submission.formid).lean();

    return res.status(200).json({
      status: "Success",
      data: submission,
      form
    });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 12: Admin Process Approval Action (Approve / Reject / Hold)
// =============================================================
exports.processApprovalAction = async (req, res) => {
  try {
    const id = req.body.id || req.body.submissionId || req.body._id;
    const colid = Number(req.body.colid || req.query.colid) || 1;
    const action = req.body.action;
    const remarks = req.body.remarks || "";
    const adminUser = req.body.user || req.body.reviewedby || "Admin";

    if (!id || !colid || !action) {
      return res.status(400).json({ status: "Error", message: "id, colid, and action are required" });
    }

    const submission = (await EvaluatorRegistrationSubmission.findOne({ _id: id, colid: Number(colid) }))
      || (await EvaluatorRegistrationSubmission.findById(id));
    if (!submission) {
      return res.status(404).json({ status: "Error", message: "Registration submission not found" });
    }

    if (action === "Reject") {
      submission.status = "Rejected";
      submission.adminremarks = remarks || "Rejected by administration";
      submission.actionby = adminUser || "Admin";
      submission.actiondate = new Date();
      await submission.save();
      return res.status(200).json({ status: "Success", message: "Application rejected.", data: submission });
    }

    if (action === "Hold") {
      submission.status = "Hold";
      submission.adminremarks = remarks || "Put on hold for verification";
      submission.actionby = adminUser || "Admin";
      submission.actiondate = new Date();
      await submission.save();
      return res.status(200).json({ status: "Success", message: "Application put on hold.", data: submission });
    }

    if (action === "Approve") {
      const userEmail = submission.email.toLowerCase().trim();
      const generatedPassword = `Pass@${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const finalRole = submission.role || "Faculty";

      const dept =
        submission.fieldValues?.department ||
        submission.fieldValues?.faculty_type ||
        submission.fieldValues?.faculty ||
        submission.fieldValues?.current_specialization ||
        submission.fieldValues?.specialization ||
        submission.fieldValues?.current_institution ||
        finalRole ||
        "General";

      // 1. Prepare User Model Payload
      const userPayload = {
        name: submission.fullname,
        email: userEmail,
        phone: submission.mobile,
        role: finalRole,
        colid: Number(colid),
        department: String(dept).trim(),
        status: 1, // Number required by User schema (1 = Active)
        status1: "Active",
        customFields: submission.customFields || {}
      };

      // Map any standard user model fields from fieldValues
      const standardKeys = [
        "department", "designation", "dob", "gender", "address", "state", "city",
        "district", "pincode", "bloodgroup", "qualification", "fathername", "mothername",
        "nationality", "category", "maritalstatus", "emergencycontact", "pan", "aadhaar", "dateofjoining"
      ];
      standardKeys.forEach((k) => {
        if (submission.fieldValues?.[k]) {
          userPayload[k] = submission.fieldValues[k];
        }
      });

      // Additional fallbacks for common fields
      if (!userPayload.designation && submission.fieldValues?.current_designation) {
        userPayload.designation = submission.fieldValues.current_designation;
      }
      if (!userPayload.institution && submission.fieldValues?.current_institution) {
        userPayload.institution = submission.fieldValues.current_institution;
      }
      if (!userPayload.department) {
        userPayload.department = String(dept).trim();
      }

      // 2. Create or Update in User Model
      let existingUser = await User.findOne({ email: userEmail });
      let finalPassword = generatedPassword;

      if (existingUser) {
        Object.assign(existingUser, userPayload);
        existingUser.status = 1;
        existingUser.status1 = "Active";
        if (!existingUser.department) {
          existingUser.department = userPayload.department;
        }
        if (submission.customFields && typeof submission.customFields === "object") {
          if (!existingUser.customFields) existingUser.customFields = new Map();
          for (const [k, v] of Object.entries(submission.customFields)) {
            if (existingUser.customFields instanceof Map) {
              existingUser.customFields.set(k, v);
            } else {
              existingUser.customFields[k] = v;
            }
          }
        }
        await existingUser.save();
      } else {
        const dummyRegNo = `FAC-${Date.now().toString().slice(-6)}`;
        await User.create({
          ...userPayload,
          password: finalPassword,
          regno: dummyRegNo,
          programcode: userPayload.department || "GEN",
          admissionyear: String(new Date().getFullYear()),
          semester: "1",
          section: "A"
        });
      }

      // 3. Ensure custom fields exist in usercustomfieldds dictionary
      if (submission.customFields && typeof submission.customFields === "object") {
        for (const [key, value] of Object.entries(submission.customFields)) {
          try {
            await UserCustomField.findOneAndUpdate(
              { colid: Number(colid), fieldname: key },
              {
                colid: Number(colid),
                fieldname: key,
                label: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                type: typeof value === "number" ? "number" : "text",
                isactive: "Yes",
                section: "Custom Registration Fields"
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          } catch (e) {
            console.error(`Failed to upsert custom field ${key}:`, e.message);
          }
        }
      }

      // 4. Populate Bank Account into userbankaccountds
      if (submission.bankDetails?.accountnumber && submission.bankDetails?.bankname) {
        await UserBankAccount.findOneAndUpdate(
          { colid: Number(colid), owneruser: userEmail, accountnumber: submission.bankDetails.accountnumber },
          {
            colid: Number(colid),
            owneruser: userEmail,
            ownername: submission.fullname,
            ownerrole: finalRole,
            bankname: submission.bankDetails.bankname,
            branchname: submission.bankDetails.branchname || "",
            accountholdername: submission.bankDetails.accountholdername || submission.fullname,
            accountnumber: submission.bankDetails.accountnumber,
            ifsccode: submission.bankDetails.ifsccode || "",
            status: "Active",
            remarks: "Populated from Evaluator/Faculty self-registration",
            createdby: adminUser || "Admin"
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      // 5. Populate Signature into usersignatureds
      if (submission.signaturelink) {
        await UserSignature.findOneAndUpdate(
          { colid: Number(colid), useremail: userEmail },
          {
            colid: Number(colid),
            user: adminUser || "Admin",
            username: submission.fullname,
            useremail: userEmail,
            signaturelink: submission.signaturelink,
            status: "Active",
            remarks: "Uploaded during Evaluator/Faculty self-registration"
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      // 6. Send Welcome Email with Portal Link, User ID, and Password
      const insInfo = await getInstitutionData(colid);
      const emailResult = await sendWelcomeEmail({
        colid,
        recipientEmail: userEmail,
        recipientName: submission.fullname,
        password: finalPassword,
        institutionName: insInfo.institutionname
      });

      // 7. Update Submission Status
      submission.status = "Approved";
      submission.createduserid = userEmail;
      submission.adminremarks = remarks || "Approved and account provisioned successfully.";
      submission.actionby = adminUser || "Admin";
      submission.actiondate = new Date();
      submission.mailsent = emailResult.sent;
      submission.mailerror = emailResult.error || "";
      await submission.save();

      return res.status(200).json({
        status: "Success",
        message: "Application approved! User account created, bank & signature populated, and credentials emailed.",
        credentials: {
          username: userEmail,
          email: userEmail,
          password: finalPassword,
          role: finalRole,
          mailsent: emailResult.sent,
          mailerror: emailResult.error || ""
        },
        data: submission
      });
    }

    return res.status(400).json({ status: "Error", message: `Invalid action: ${action}` });
  } catch (err) {
    console.error("processApprovalAction error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 13: Admin Update Submission & Sync with User Model
// =============================================================
exports.updateSubmission = async (req, res) => {
  try {
    const colid = Number(req.body.colid || req.query.colid) || 1;
    const id = req.body.id || req.body.submissionId || req.body._id;
    const {
      fullname,
      email,
      mobile,
      role,
      department,
      designation,
      institution,
      status,
      adminremarks,
      bankDetails,
      fieldValues,
      customFields,
      user: adminUser
    } = req.body;

    if (!id) {
      return res.status(400).json({ status: "Error", message: "Submission id is required" });
    }

    const submission =
      (await EvaluatorRegistrationSubmission.findOne({ _id: id, colid })) ||
      (await EvaluatorRegistrationSubmission.findById(id));
    if (!submission) {
      return res.status(404).json({ status: "Error", message: "Submission not found" });
    }

    const oldEmail = submission.email;

    // 1. Update submission core fields
    if (fullname !== undefined) submission.fullname = String(fullname).trim();
    if (email !== undefined) submission.email = String(email).toLowerCase().trim();
    if (mobile !== undefined) submission.mobile = String(mobile).trim();
    if (role !== undefined) submission.role = String(role).trim();
    if (status !== undefined) submission.status = status;
    if (adminremarks !== undefined) submission.adminremarks = adminremarks;
    if (adminUser) submission.actionby = adminUser;
    submission.actiondate = new Date();

    // 2. Update dynamic fields and custom fields
    if (fieldValues && typeof fieldValues === "object") {
      submission.fieldValues = {
        ...(submission.fieldValues || {}),
        ...fieldValues
      };
    }
    if (customFields && typeof customFields === "object") {
      submission.customFields = {
        ...(submission.customFields || {}),
        ...customFields
      };
    }

    if (department) {
      submission.fieldValues = submission.fieldValues || {};
      submission.fieldValues.department = department;
    }
    if (designation) {
      submission.fieldValues = submission.fieldValues || {};
      submission.fieldValues.designation = designation;
      submission.fieldValues.current_designation = designation;
    }
    if (institution) {
      submission.fieldValues = submission.fieldValues || {};
      submission.fieldValues.institution = institution;
      submission.fieldValues.current_institution = institution;
    }

    // 3. Update bank details
    if (bankDetails && typeof bankDetails === "object") {
      submission.bankDetails = {
        ...(submission.bankDetails || {}),
        ...bankDetails
      };
    }

    await submission.save();

    // 4. If linked user exists or submission is Approved, sync User model
    const targetEmail = (submission.email || oldEmail || "").toLowerCase().trim();
    let userSynced = false;

    if (targetEmail) {
      const existingUser =
        (await User.findOne({ email: targetEmail })) ||
        (oldEmail && oldEmail !== targetEmail ? await User.findOne({ email: oldEmail.toLowerCase().trim() }) : null);

      if (existingUser) {
        if (submission.fullname) existingUser.name = submission.fullname;
        if (submission.email) existingUser.email = submission.email.toLowerCase().trim();
        if (submission.mobile) existingUser.phone = submission.mobile;
        if (submission.role) existingUser.role = submission.role;
        if (department) existingUser.department = department;
        if (designation) existingUser.designation = designation;
        if (institution) existingUser.institution = institution;

        if (status === "Approved") {
          existingUser.status = 1;
          existingUser.status1 = "Active";
        } else if (status === "Hold" || status === "Rejected") {
          existingUser.status = 0;
          existingUser.status1 = status;
        }

        if (submission.customFields && typeof submission.customFields === "object") {
          if (!existingUser.customFields) existingUser.customFields = new Map();
          for (const [k, v] of Object.entries(submission.customFields)) {
            if (existingUser.customFields instanceof Map) {
              existingUser.customFields.set(k, v);
            } else {
              existingUser.customFields[k] = v;
            }
          }
        }

        await existingUser.save();
        userSynced = true;
      }
    }

    // 5. Sync UserBankAccount if bank details changed
    if (submission.bankDetails?.accountnumber && submission.bankDetails?.bankname && targetEmail) {
      try {
        await UserBankAccount.findOneAndUpdate(
          { colid: Number(colid), owneruser: targetEmail },
          {
            colid: Number(colid),
            owneruser: targetEmail,
            ownername: submission.fullname,
            ownerrole: submission.role || "Faculty",
            bankname: submission.bankDetails.bankname,
            branchname: submission.bankDetails.branchname || "",
            accountholdername: submission.bankDetails.accountholdername || submission.fullname,
            accountnumber: submission.bankDetails.accountnumber,
            ifsccode: submission.bankDetails.ifsccode || "",
            status: "Active",
            remarks: "Updated by admin"
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (be) {
        console.error("Error updating UserBankAccount:", be.message);
      }
    }

    return res.status(200).json({
      status: "Success",
      message: userSynced
        ? "Application and linked user account updated successfully."
        : "Application details updated successfully.",
      data: submission,
      userSynced
    });
  } catch (err) {
    console.error("updateSubmission error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};
