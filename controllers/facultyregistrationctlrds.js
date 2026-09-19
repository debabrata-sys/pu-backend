const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");

const FacultyRegistrationLink = require("../Models/facultyregistrationlinkds");
const FacultyRegistrationRequest = require("../Models/facultyregistrationrequestds");
const User = require("../Models/user");
const UserCustomField = require("../Models/usercustomfieldds");
const UserBankAccount = require("../Models/userbankaccountds");
const UserSignature = require("../Models/usersignatureds");
const UserEmploymentDetail = require("../Models/useremploymentdetailds");
const EmailConfiguration = require("../Models/emailconfigurationds");
const Institution = require("../Models/institutions");

// -------------------------------------------------------------
// Upload Storage Configuration
// -------------------------------------------------------------
const uploadDir = path.join(__dirname, "..", "public", "uploads", "faculty_registrations");
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
  const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".pdf"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return cb(new Error("Only .jpg, .jpeg, .png, .gif and .pdf files are allowed"), false);
  }
  cb(null, true);
};

// 300 KB limit as indicated on the PDF form
exports.uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 300 * 1024 }
}).single("file");

// -------------------------------------------------------------
// Helper: Get Institution Info
// -------------------------------------------------------------
const getInstitutionData = async (colid) => {
  try {
    const ins = await Institution.findOne({ colid: Number(colid) }).lean();
    if (ins) {
      return {
        institutionname: ins.institutionname || "People's University",
        institutioncode: ins.institutioncode || "PU",
        logo: ins.logo || ""
      };
    }
  } catch (err) {
    console.error("Error fetching institution data:", err.message);
  }
  return {
    institutionname: "People's University, Bhopal",
    institutioncode: "PU",
    logo: ""
  };
};

// -------------------------------------------------------------
// Helper: Email Transporter Setup
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
    let transporter;

    if (config?.username && config?.password) {
      const port = Number(config.port || 587);
      const host = config.smtp || config.smptp || (/gmail/i.test(config.provider || "") ? "smtp.gmail.com" : "");
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user: config.username, pass: config.password }
      });
    } else {
      // Fallback: development test account
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: "ethereal.user@ethereal.email",
          pass: "ethereal_password"
        }
      });
    }

    const appUrl = process.env.CLIENT_URL || "http://localhost:3001";
    const subject = `Welcome to ${institutionName} - Login Credentials`;
    const text = `Dear ${recipientName},\n\nYour registration has been approved. Your login credentials are:\n\nPortal: ${appUrl}\nUsername / User ID: ${recipientEmail}\nPassword: ${password}\n\nPlease change your password upon your first login.\n\nBest regards,\n${institutionName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a365d; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px;">${institutionName}</h2>
        <p>Dear <b>${recipientName}</b>,</p>
        <p>Your self-registration application has been <b>approved</b> by the administration. Your account has been provisioned with Faculty & Valuator privileges.</p>
        
        <div style="background-color: #f7fafc; border-left: 4px solid #3182ce; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><b>Login Portal:</b> <a href="${appUrl}">${appUrl}</a></p>
          <p style="margin: 4px 0;"><b>User ID (Email):</b> <code>${recipientEmail}</code></p>
          <p style="margin: 4px 0;"><b>Temporary Password:</b> <code>${password}</code></p>
        </div>

        <p style="color: #4a5568;">Please keep these credentials secure. You may update your profile once logged in.</p>
        <p style="font-size: 12px; color: #718096; margin-top: 30px;">This is an automated notification. Please do not reply directly to this email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: config?.username ? `"${institutionName}" <${config.username}>` : `"Administration" <no-reply@peoplesuniversity.edu.in>`,
      to: recipientEmail,
      subject,
      text,
      html
    });

    return { sent: true };
  } catch (err) {
    console.error("Error sending welcome email:", err.message);
    return { sent: false, error: err.message };
  }
};

// -------------------------------------------------------------
// Helper: Ensure Custom Fields Defined
// -------------------------------------------------------------
const ensureCustomFieldsDefined = async (colid) => {
  const fieldsToEnsure = [
    { fieldname: "faculty_type", label: "Faculty Type", page: "Page 1", section: "Registration Details", type: "text" },
    { fieldname: "valuator_type", label: "Valuator Type", page: "Page 1", section: "Registration Details", type: "text" },
    { fieldname: "alternate_mobile", label: "Alternate Mobile Number", page: "Page 1", section: "Contact Details", type: "text" },
    { fieldname: "teaching_experience_years", label: "Teaching Experience (Years)", page: "Page 1", section: "Professional Experience", type: "number" },
    { fieldname: "teaching_experience_months", label: "Teaching Experience (Months)", page: "Page 1", section: "Professional Experience", type: "number" },
    { fieldname: "medical_council_id", label: "Medical/Dental Council ID", page: "Page 1", section: "Professional Details", type: "text" },
    { fieldname: "subjects_taught", label: "Subject(s) Taught", page: "Page 1", section: "Academic Details", type: "text" },
    { fieldname: "pan_card_link", label: "PAN Card Document", page: "Page 1", section: "KYC Documents", type: "text" }
  ];

  for (let i = 0; i < fieldsToEnsure.length; i++) {
    const f = fieldsToEnsure[i];
    try {
      await UserCustomField.findOneAndUpdate(
        { colid: Number(colid), fieldname: f.fieldname },
        { ...f, colid: Number(colid), isactive: "Yes", isrequired: "No", order: i + 1 },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
      console.error(`Failed to register custom field ${f.fieldname}:`, e.message);
    }
  }
};

// =============================================================
// API 1: Public File Upload (Handles Photo, Signature, PAN Card)
// =============================================================
exports.uploadPublicFile = (req, res) => {
  exports.uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ status: "Error", message: "File size exceeds 300 KB limit." });
      }
      return res.status(400).json({ status: "Error", message: err.message || "File upload failed." });
    }

    if (!req.file) {
      return res.status(400).json({ status: "Error", message: "No file was uploaded." });
    }

    const fileUrl = `/uploads/faculty_registrations/${req.file.filename}`;
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
// API 2: Public Registration Info (Metadata, Validation, Dropdowns)
// =============================================================
exports.getPublicRegistrationInfo = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const token = String(req.query.token || "").trim();

    let linkData = null;
    if (token) {
      linkData = await FacultyRegistrationLink.findOne({ token, colid }).lean();
      if (!linkData) {
        return res.status(404).json({ status: "Error", message: "Invalid or expired registration link token." });
      }
      if (linkData.status !== "Active") {
        return res.status(400).json({ status: "Error", message: "This registration link is currently inactive." });
      }
      if (linkData.validuntil && new Date() > new Date(linkData.validuntil)) {
        return res.status(400).json({ status: "Error", message: "This registration link has expired." });
      }
      if (linkData.maxsubmissions > 0 && linkData.submissioncount >= linkData.maxsubmissions) {
        return res.status(400).json({ status: "Error", message: "Maximum submission capacity reached for this link." });
      }
    }

    const institution = await getInstitutionData(colid);

    return res.status(200).json({
      status: "Success",
      colid,
      institution,
      link: linkData
        ? {
            title: linkData.title,
            role: linkData.role,
            department: linkData.department,
            facultytype: linkData.facultytype,
            valuatortype: linkData.valuatortype
          }
        : null,
      options: {
        facultyTypes: ["Regular", "Contractual", "Visiting", "Adjunct", "Guest", "External", "Internal"],
        valuatorTypes: [
          "Chief Valuator",
          "Valuator",
          "Paper Setter",
          "Moderator",
          "External Examiner",
          "Internal Examiner"
        ],
        genders: ["Male", "Female", "Other"]
      }
    });
  } catch (err) {
    console.error("getPublicRegistrationInfo error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 3: Public Submit Registration
// =============================================================
exports.submitPublicRegistration = async (req, res) => {
  try {
    const {
      colid,
      linktoken,
      facultytype,
      valuatortype,
      gender,
      fullname,
      email,
      mobile,
      alternatemobile,
      teachingexperience_years,
      teachingexperience_months,
      photolink,
      signaturelink,
      currentemployment,
      pastemployment,
      accountnumber,
      accountholdername,
      bankname,
      ifsccode,
      branchname,
      pancardnumber,
      pancardlink
    } = req.body;

    if (!colid) return res.status(400).json({ status: "Error", message: "colid is required." });
    if (!fullname || !email || !mobile) {
      return res.status(400).json({ status: "Error", message: "Full Name, Email, and Mobile Number are required." });
    }
    if (!facultytype || !valuatortype || !gender) {
      return res.status(400).json({ status: "Error", message: "Faculty Type, Valuator Type, and Gender are required." });
    }
    if (!accountnumber || !bankname || !ifsccode) {
      return res.status(400).json({ status: "Error", message: "Bank Account Number, Bank Name, and IFSC Code are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Check if an approved/active user already exists
    const existingUser = await User.findOne({ email: cleanEmail, colid: Number(colid) });
    if (existingUser) {
      return res.status(400).json({
        status: "Error",
        message: "An active account with this email address already exists. Please login instead."
      });
    }

    // Check if a pending registration request is already submitted
    const existingPending = await FacultyRegistrationRequest.findOne({
      email: cleanEmail,
      colid: Number(colid),
      status: "Pending"
    });
    if (existingPending) {
      return res.status(400).json({
        status: "Error",
        message: "A registration request with this email is already under review by the administration."
      });
    }

    // Link validation (if linktoken provided)
    if (linktoken) {
      const linkDoc = await FacultyRegistrationLink.findOne({ token: linktoken, colid: Number(colid) });
      if (linkDoc) {
        linkDoc.submissioncount = (linkDoc.submissioncount || 0) + 1;
        await linkDoc.save();
      }
    }

    // Create registration record
    const registration = await FacultyRegistrationRequest.create({
      colid: Number(colid),
      linktoken: linktoken || "",
      facultytype: String(facultytype).trim(),
      valuatortype: String(valuatortype).trim(),
      gender: String(gender).trim(),
      fullname: String(fullname).trim(),
      email: cleanEmail,
      mobile: String(mobile).trim(),
      alternatemobile: String(alternatemobile || "").trim(),
      teachingexperience_years: Number(teachingexperience_years || 0),
      teachingexperience_months: Number(teachingexperience_months || 0),
      photolink: String(photolink || "").trim(),
      signaturelink: String(signaturelink || "").trim(),
      currentemployment: currentemployment || {},
      pastemployment: Array.isArray(pastemployment) ? pastemployment : [],
      accountnumber: String(accountnumber).trim(),
      accountholdername: String(accountholdername || fullname).trim(),
      bankname: String(bankname).trim(),
      ifsccode: String(ifsccode).trim().toUpperCase(),
      branchname: String(branchname || "").trim(),
      pancardnumber: String(pancardnumber || "").trim().toUpperCase(),
      pancardlink: String(pancardlink || "").trim(),
      status: "Pending"
    });

    return res.status(200).json({
      status: "Success",
      message: "Your registration form has been submitted successfully! The administration will review your application and send your login credentials via email once approved.",
      data: {
        id: registration._id,
        fullname: registration.fullname,
        email: registration.email,
        status: registration.status
      }
    });
  } catch (err) {
    console.error("submitPublicRegistration error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 4: Admin - Link Management
// =============================================================
exports.createLink = async (req, res) => {
  try {
    const { colid, title, role, department, facultytype, valuatortype, validuntil, maxsubmissions, user, username } =
      req.body;

    if (!colid) return res.status(400).json({ status: "Error", message: "colid is required" });

    const token = crypto.randomBytes(8).toString("hex");
    const clientBase = process.env.CLIENT_URL || "http://localhost:3001";
    const generatedUrl = `${clientBase}/faculty-registration?colid=${colid}&token=${token}`;

    const link = await FacultyRegistrationLink.create({
      colid: Number(colid),
      title: title || "Faculty & Valuator Registration",
      token,
      role: role || "Faculty",
      department: department || "",
      facultytype: facultytype || "",
      valuatortype: valuatortype || "",
      validuntil: validuntil ? new Date(validuntil) : null,
      maxsubmissions: Number(maxsubmissions || 0),
      status: "Active",
      url: generatedUrl,
      createdby: user || "",
      createdname: username || ""
    });

    return res.status(200).json({ status: "Success", data: link });
  } catch (err) {
    console.error("createLink error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

exports.getLinks = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const links = await FacultyRegistrationLink.find({ colid }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ status: "Success", data: links });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

exports.toggleLinkStatus = async (req, res) => {
  try {
    const { id, colid, status } = req.body;
    const updated = await FacultyRegistrationLink.findOneAndUpdate(
      { _id: id, colid: Number(colid) },
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ status: "Error", message: "Link not found" });
    return res.status(200).json({ status: "Success", data: updated });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

exports.deleteLink = async (req, res) => {
  try {
    const { id, colid } = req.body;
    const deleted = await FacultyRegistrationLink.findOneAndDelete({ _id: id, colid: Number(colid) });
    if (!deleted) return res.status(404).json({ status: "Error", message: "Link not found" });
    return res.status(200).json({ status: "Success", message: "Deleted successfully" });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 5: Admin - List & Filter Registration Requests
// =============================================================
exports.getRegistrationRequests = async (req, res) => {
  try {
    const colid = Number(req.query.colid) || 1;
    const status = String(req.query.status || "").trim();
    const search = String(req.query.search || "").trim();

    const query = { colid };
    if (status && status !== "All") {
      query.status = status;
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { fullname: regex },
        { email: regex },
        { mobile: regex },
        { accountnumber: regex },
        { pancardnumber: regex },
        { "currentemployment.designation": regex },
        { "currentemployment.institution": regex }
      ];
    }

    const items = await FacultyRegistrationRequest.find(query).sort({ createdAt: -1 }).lean();

    const stats = {
      total: await FacultyRegistrationRequest.countDocuments({ colid }),
      pending: await FacultyRegistrationRequest.countDocuments({ colid, status: "Pending" }),
      approved: await FacultyRegistrationRequest.countDocuments({ colid, status: "Approved" }),
      hold: await FacultyRegistrationRequest.countDocuments({ colid, status: "Hold" }),
      rejected: await FacultyRegistrationRequest.countDocuments({ colid, status: "Rejected" })
    };

    return res.status(200).json({
      status: "Success",
      data: items,
      stats
    });
  } catch (err) {
    console.error("getRegistrationRequests error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 6: Admin - Get Registration Detail
// =============================================================
exports.getRegistrationDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const colid = Number(req.query.colid) || 1;

    const item = await FacultyRegistrationRequest.findOne({ _id: id, colid }).lean();
    if (!item) {
      return res.status(404).json({ status: "Error", message: "Registration not found" });
    }

    return res.status(200).json({ status: "Success", data: item });
  } catch (err) {
    return res.status(500).json({ status: "Error", message: err.message });
  }
};

// =============================================================
// API 7: Admin - Approve / Reject / Hold Registration Action
// =============================================================
exports.processRegistrationAction = async (req, res) => {
  try {
    const { id, colid, action, remarks, user: adminUser } = req.body;

    if (!id || !colid || !action) {
      return res.status(400).json({ status: "Error", message: "id, colid, and action are required." });
    }

    const registration = await FacultyRegistrationRequest.findOne({ _id: id, colid: Number(colid) });
    if (!registration) {
      return res.status(404).json({ status: "Error", message: "Registration application not found." });
    }

    if (["Reject", "Rejected"].includes(action)) {
      registration.status = "Rejected";
      registration.adminremarks = remarks || "Application rejected by administrator";
      registration.actionby = adminUser || "Admin";
      registration.actiondate = new Date();
      await registration.save();
      return res.status(200).json({ status: "Success", message: "Registration rejected.", data: registration });
    }

    if (["Hold"].includes(action)) {
      registration.status = "Hold";
      registration.adminremarks = remarks || "Application placed on hold for verification";
      registration.actionby = adminUser || "Admin";
      registration.actiondate = new Date();
      await registration.save();
      return res.status(200).json({ status: "Success", message: "Registration placed on hold.", data: registration });
    }

    if (["Approve", "Approved"].includes(action)) {
      // 1. Ensure custom user fields exist in usercustomfieldds
      await ensureCustomFieldsDefined(colid);

      // 2. Generate a secure temporary password
      const tempPassword = `PU@${crypto.randomBytes(3).toString("hex")}`;
      const userEmail = registration.email.toLowerCase();

      // 3. Check or Create User Account
      let existingUser = await User.findOne({ email: userEmail, colid: Number(colid) });
      let finalPassword = tempPassword;

      const customFieldsData = {
        faculty_type: registration.facultytype,
        valuator_type: registration.valuatortype,
        alternate_mobile: registration.alternatemobile,
        teaching_experience_years: registration.teachingexperience_years,
        teaching_experience_months: registration.teachingexperience_months,
        medical_council_id: registration.currentemployment?.medicalcouncilid || "",
        subjects_taught: registration.currentemployment?.subjectstaught || "",
        pan_card_link: registration.pancardlink || ""
      };

      if (existingUser) {
        // Update existing user with role and details
        existingUser.role = "Faculty";
        existingUser.name = registration.fullname;
        existingUser.phone = registration.mobile;
        existingUser.pan = registration.pancardnumber;
        existingUser.photo = registration.photolink || existingUser.photo;
        existingUser.customFields = customFieldsData;
        await existingUser.save();
      } else {
        // Create brand new User
        await User.create({
          email: userEmail,
          name: registration.fullname,
          phone: registration.mobile,
          password: tempPassword,
          role: "Faculty",
          regno: registration.currentemployment?.medicalcouncilid || `FAC${Date.now().toString().slice(-6)}`,
          programcode: registration.currentemployment?.specialization || "GENERAL",
          program: registration.currentemployment?.specialization || "Faculty",
          admissionyear: new Date().getFullYear().toString(),
          academicyear: `${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`,
          semester: "1",
          section: "A",
          gender: registration.gender,
          department: registration.currentemployment?.specialization || "Academics",
          designation: registration.currentemployment?.designation || "Faculty",
          pan: registration.pancardnumber,
          photo: registration.photolink,
          colid: Number(colid),
          admincolid: Number(colid),
          status: 1,
          authenticator: "No",
          excluded: "No",
          customFields: customFieldsData
        });
      }

      // 4. Populate Bank Details into userbankaccountds
      if (registration.accountnumber && registration.bankname) {
        await UserBankAccount.findOneAndUpdate(
          { colid: Number(colid), owneruser: userEmail, accountnumber: registration.accountnumber },
          {
            colid: Number(colid),
            owneruser: userEmail,
            ownername: registration.accountholdername || registration.fullname,
            ownerrole: "Faculty",
            bankname: registration.bankname,
            branchname: registration.branchname || "",
            accountholdername: registration.accountholdername || registration.fullname,
            accountnumber: registration.accountnumber,
            ifsccode: registration.ifsccode,
            status: "Active",
            isdefault: "Yes",
            attachment: registration.pancardlink
              ? {
                  url: registration.pancardlink,
                  filename: "pancard",
                  uploadedat: new Date()
                }
              : undefined,
            createdby: adminUser || "Admin"
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      // 5. Populate Signature into usersignatureds
      if (registration.signaturelink) {
        await UserSignature.findOneAndUpdate(
          { colid: Number(colid), useremail: userEmail },
          {
            colid: Number(colid),
            user: adminUser || "Admin",
            username: registration.fullname,
            useremail: userEmail,
            signaturelink: registration.signaturelink,
            status: "Active",
            remarks: "Uploaded during faculty self-registration"
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      // 6. Populate Employment History into useremploymentdetailds
      if (registration.currentemployment?.institution) {
        await UserEmploymentDetail.findOneAndUpdate(
          {
            colid: Number(colid),
            owneruser: userEmail,
            organizationname: registration.currentemployment.institution,
            dateofjoining: registration.currentemployment.dateofjoining || ""
          },
          {
            colid: Number(colid),
            owneruser: userEmail,
            ownername: registration.fullname,
            role: "Faculty",
            organizationname: registration.currentemployment.institution,
            designation: registration.currentemployment.designation || "",
            dateofjoining: registration.currentemployment.dateofjoining || "",
            lastworkingdate: registration.currentemployment.dateofexit || "till date",
            status: "Active",
            user: adminUser || "Admin"
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      if (Array.isArray(registration.pastemployment) && registration.pastemployment.length > 0) {
        for (const past of registration.pastemployment) {
          if (past.institution) {
            await UserEmploymentDetail.findOneAndUpdate(
              {
                colid: Number(colid),
                owneruser: userEmail,
                organizationname: past.institution,
                dateofjoining: past.dateofjoining || ""
              },
              {
                colid: Number(colid),
                owneruser: userEmail,
                ownername: registration.fullname,
                role: "Faculty",
                organizationname: past.institution,
                designation: past.designation || "",
                dateofjoining: past.dateofjoining || "",
                lastworkingdate: past.dateofexit || "",
                status: "Active",
                user: adminUser || "Admin"
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
        }
      }

      // 7. Send Welcome Email with Credentials
      const insInfo = await getInstitutionData(colid);
      const emailResult = await sendWelcomeEmail({
        colid,
        recipientEmail: userEmail,
        recipientName: registration.fullname,
        password: finalPassword,
        institutionName: insInfo.institutionname
      });

      // 8. Update Registration Request
      registration.status = "Approved";
      registration.createduserid = userEmail;
      registration.adminremarks = remarks || "Approved and account created successfully";
      registration.actionby = adminUser || "Admin";
      registration.actiondate = new Date();
      registration.mailsent = emailResult.sent;
      registration.mailerror = emailResult.error || "";
      await registration.save();

      return res.status(200).json({
        status: "Success",
        message: "Application approved successfully! User account, bank details, signature, and employment profile have been populated.",
        credentials: {
          email: userEmail,
          password: finalPassword,
          role: "Faculty",
          mailsent: emailResult.sent,
          mailerror: emailResult.error || ""
        },
        data: registration
      });
    }

    return res.status(400).json({ status: "Error", message: `Invalid action: ${action}` });
  } catch (err) {
    console.error("processRegistrationAction error:", err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};
