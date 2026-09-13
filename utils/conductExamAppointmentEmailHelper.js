const nodemailer = require("nodemailer");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const EmailConfiguration = require("../Models/emailconfigurationds");
const { getExamConfigHelper } = require("../controllers/conductexamconfigurationctlrds");

const cleanText = (val) => String(val || "").trim();

const formatDate = (date = new Date()) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-GB");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

const generatePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 6; i += 1) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Exam@${pass}`;
};

/**
 * Ensures a User record exists for the given email.
 * If not, provisions a new Faculty/PaperSetter user account with generated password.
 */
async function getOrProvisionUser(colid, name, email, role = "Faculty", courseContext = {}) {
  const cleanEmail = cleanText(email).toLowerCase();
  if (!cleanEmail) return null;

  try {
    let existing = await User.findOne({ email: new RegExp(`^${cleanEmail}$`, "i") });
    if (existing) {
      return {
        user: existing,
        userId: existing.email || existing.regno,
        password: existing.password || "Welcome@123",
        isNew: false
      };
    }

    const newPassword = generatePassword();
    const regno = `EX-${Date.now().toString().slice(-6)}`;
    const userPayload = {
      name: cleanText(name) || "Examiner",
      email: cleanEmail,
      phone: cleanText(courseContext.phone) || "9876543210",
      password: newPassword,
      role: role || "Faculty",
      regno,
      colid: Number(colid) || 1,
      department: cleanText(courseContext.department || courseContext.subject || courseContext.program) || "Academics",
      program: cleanText(courseContext.program) || "NA",
      programcode: cleanText(courseContext.programcode) || "NA",
      admissionyear: cleanText(courseContext.academicyear) || String(new Date().getFullYear()),
      semester: cleanText(courseContext.semester) || "NA",
      section: "A",
      status: 1,
      authenticator: "No"
    };

    const created = await User.create(userPayload);
    return {
      user: created,
      userId: created.email,
      password: newPassword,
      isNew: true
    };
  } catch (err) {
    console.error("[AppointmentEmailHelper] getOrProvisionUser error:", err.message);
    return {
      user: null,
      userId: cleanEmail,
      password: generatePassword(),
      isNew: true
    };
  }
}

/**
 * Loads Institution details from Exam Configuration (or insdetails fallback)
 */
async function loadInstitutionDetails(colid) {
  try {
    return await getExamConfigHelper(colid);
  } catch (err) {
    console.error("[AppointmentEmailHelper] loadInstitutionDetails error:", err.message);
    return {};
  }
}

/**
 * Loads EmailConfiguration for colid
 */
async function loadEmailConfig(colid) {
  try {
    const numColid = Number(colid);
    let config = await EmailConfiguration.findOne({ colid: numColid, isactive: /^Yes$/i, default: /^Yes$/i }).lean();
    if (!config) {
      config = await EmailConfiguration.findOne({ colid: numColid, isactive: /^Yes$/i }).lean();
    }
    if (!config) {
      config = await EmailConfiguration.findOne({ isactive: /^Yes$/i, default: /^Yes$/i }).lean();
    }
    if (!config) {
      config = await EmailConfiguration.findOne({ isactive: /^Yes$/i }).lean();
    }
    return config;
  } catch (err) {
    console.error("[AppointmentEmailHelper] loadEmailConfig error:", err.message);
    return null;
  }
}

/**
 * Generates official appointment letter HTML matching university PDF format.
 */
function generateAppointmentLetterHtml(params) {
  const {
    institution = {},
    recipientName = "",
    recipientEmail = "",
    recipientDesignation = "Professor & Head",
    recipientDept = "",
    courseName = "",
    courseCode = "",
    subject = "",
    program = "",
    semester = "",
    academicYear = "",
    examName = "",
    examCode = "",
    userId = "",
    password = "",
    portalUrl = "https://campustechnology.me",
    isModerator = false,
    isEvaluator = false,
    refNo = "",
    examinerCode = "",
    confNo = "",
    date = formatDate()
  } = params;

  const instName = institution.institutionname || "Institution";
  const instBoard = institution.affiliatedboard || "";
  const instAddress = institution.address || "";
  const instContact = institution.phone || institution.contactusdetails || "";
  const instEmail = institution.email || institution.contactemail || "";
  const instLogo = institution.logo || "";
  const coeName = institution.coename || "";
  const coeTitle = isEvaluator
    ? "Assistant Registrar (Evaluation)"
    : (institution.coetitle || "Assistant Registrar(Confidential)");
  const vcName = institution.vcname || "";
  const roleTitle = isEvaluator ? "Evaluator" : isModerator ? "Moderator" : "Paper-setter/Examiner";
  const subjectRole = isEvaluator
    ? "Appointment as Evaluator"
    : isModerator
    ? "Appointment of Moderator"
    : "Appointment of Paper-Setter";

  const fullPaperTitle = subject && subject !== courseName ? `${subject} (${courseName})` : (courseName || subject || "Course Paper");
  const progSemYear = [
    program,
    semester ? `Semester ${semester}` : "",
    academicYear ? `Academic Year ${academicYear}` : ""
  ].filter(Boolean).join(" - ") || "Upcoming Examinations";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${subjectRole}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: 'Times New Roman', Times, serif, Arial; color: #111; background-color: #f4f5f7;">
  <div style="max-width: 780px; margin: 0 auto; background: #fff; padding: 36px 44px; border: 1px solid #d1d5db; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    
    <!-- Top University Header with Big Institution Name and Affiliated Board -->
    <div style="text-align: center; margin-bottom: 12px;">
      ${instLogo ? `<img src="${instLogo}" alt="Logo" style="max-height: 70px; margin-bottom: 8px; object-fit: contain;" /><br/>` : ""}
      <h1 style="margin: 0; font-size: 30px; font-weight: 900; letter-spacing: 1px; color: #0f172a; text-transform: uppercase; line-height: 1.2;">
        ${instName}
      </h1>
      ${instBoard ? `<div style="font-size: 15px; font-weight: 600; color: #1e3a8a; margin: 4px 0 2px 0;">(${instBoard})</div>` : ""}
      <div style="font-size: 12px; color: #475569; margin-top: 4px;">
        ${instAddress ? `<span>${instAddress}</span>` : ""}
        ${instContact ? ` &nbsp;|&nbsp; <span>Ph: ${instContact}</span>` : ""}
        ${instEmail ? ` &nbsp;|&nbsp; <span>E-mail: <a href="mailto:${instEmail}" style="color: #1d4ed8; text-decoration: none;">${instEmail}</a></span>` : ""}
      </div>
    </div>

    <div style="border-top: 2px solid #000; margin: 12px 0 8px 0;"></div>

    <div style="text-align: center; font-weight: bold; font-size: 13px; letter-spacing: 1px; text-decoration: underline; margin-bottom: 12px;">
      MOST CONFIDENTIAL &amp; URGENT
    </div>

    <!-- Ref No & Date -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
      <tr>
        <td style="vertical-align: top; font-size: 13px;">
          <strong>Ref. No:</strong> ${refNo}<br/>
          <span style="font-style: italic; color: #4b5563;">Through E-mail</span>
        </td>
        <td style="vertical-align: top; text-align: right; font-size: 13px;">
          <strong>Date:</strong> ${date}
        </td>
      </tr>
    </table>

    <!-- From / To & Confidential Box -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        <td style="width: 58%; vertical-align: top; font-size: 13px; line-height: 1.5;">
          <strong>From:</strong><br/>
          ${coeTitle},<br/>
          ${instName},<br/>
          ${instAddress}
          <br/><br/>
          <strong>To,</strong><br/>
          <strong style="font-size: 14px;">${recipientName}</strong>${recipientDesignation ? ', ' + recipientDesignation : ''}<br/>
          ${recipientDept ? recipientDept + ', ' : ''}${instName}
        </td>
        <td style="width: 42%; vertical-align: top;">
          <div style="border: 1px solid #1f2937; padding: 10px 12px; font-size: 12px; line-height: 1.45; background-color: #f9fafb;">
            <strong>Examiner Code No. - </strong> <span style="font-family: monospace; font-weight: bold;">${examinerCode}</span><br/>
            <strong>Conf. No- </strong> <span style="font-family: monospace; font-weight: bold;">${confNo}</span><br/><br/>
            <span style="font-size: 11px; color: #4b5563; font-style: italic;">
              (To be quoted in all correspondence &amp; on all covers to be sent to this office)
            </span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Subject -->
    <div style="font-size: 14px; font-weight: bold; text-decoration: underline; margin: 14px 0 10px 0;">
      Subject: - ${subjectRole}
    </div>

    <div style="font-size: 13px; margin-bottom: 10px;">
      Dear Sir/Madam,
    </div>

    <!-- Letter Body Clauses -->
    <div style="font-size: 13px; line-height: 1.6; color: #111;">
      
      ${isEvaluator ? `
      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>1.</strong> With the approval of ${vcName ? `the Vice Chancellor (${vcName})` : "the Vice Chancellor"} of the University, an assignment as <strong>Evaluator</strong> is offered to you for the valuation/evaluation of answer books for:
      </p>

      <table style="width: 100%; border-collapse: collapse; border: 1px solid #374151; margin: 10px 0 14px 0; font-size: 12px;">
        <thead>
          <tr style="background-color: #f1f5f9; text-align: center;">
            <th style="border: 1px solid #374151; padding: 6px; width: 10%;">S.No.</th>
            <th style="border: 1px solid #374151; padding: 6px; width: 22%;">Paper Code</th>
            <th style="border: 1px solid #374151; padding: 6px; text-align: left; width: 44%;">Paper Name</th>
            <th style="border: 1px solid #374151; padding: 6px; width: 24%;">Program / Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #374151; padding: 6px; text-align: center;">1.</td>
            <td style="border: 1px solid #374151; padding: 6px; text-align: center; font-weight: bold;">${courseCode || 'N/A'}</td>
            <td style="border: 1px solid #374151; padding: 6px;">${fullPaperTitle}</td>
            <td style="border: 1px solid #374151; padding: 6px; text-align: center;">${progSemYear}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>2.</strong> The valuation will commence from <strong>${date}</strong> online on the On-Screen Marking Portal (or Room No. 37, Central Valuation Room, IIIrd floor, Office of COE, Administrative Block, ${instName}).
      </p>

      <!-- Portal Credentials Box -->
      <p style="margin: 0 0 4px 0;">
        <strong>3.</strong> You can access your assigned valuation dashboard and evaluate answer scripts directly via the official portal using the credentials below:
      </p>
      <div style="margin: 8px 0 14px 20px; padding: 12px 16px; background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6;">
        <div><strong>Portal URL:</strong> <a href="${portalUrl}" target="_blank" style="color: #15803d; font-weight: bold; text-decoration: underline;">${portalUrl}</a></div>
        <div><strong>User ID / Login:</strong> <span style="font-family: monospace; font-weight: bold; background: #dcfce7; padding: 2px 6px; border-radius: 3px;">${userId}</span></div>
        <div><strong>Password:</strong> <span style="font-family: monospace; font-weight: bold; background: #dcfce7; padding: 2px 6px; border-radius: 3px;">${password}</span></div>
      </div>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>4.</strong> You are requested to evaluate minimum 30 answer scripts per day strictly as per the prescribed model answer key and marking scheme.
      </p>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>5.</strong> <strong>Acceptance &amp; Declaration Forms:</strong> Prior to evaluating scripts on the On-Screen Marking portal, you are required to submit the mandatory <strong>Acceptance Form</strong> and <strong>Declaration Form</strong> under On-Screen Marking.
      </p>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>6.</strong> <strong>Remuneration:</strong> Remuneration will be paid as per the approved Examiner Rate Card. Upon completion of marking, please verify your bank particulars and view/submit your <strong>Remuneration Bill</strong> on the portal for timely processing.
      </p>

      <p style="margin: 0 0 12px 0; text-align: justify;">
        <strong>7.</strong> Kindly maintain strict confidentiality regarding examinees, scripts, marks awarded, and all valuation records.
      </p>
      ` : `
      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>1.</strong> With the approval of ${vcName ? `the Vice Chancellor (${vcName})` : "the Vice Chancellor"} of the University, an assignment as <strong>${roleTitle}</strong> is offered to you in; 
        Subject/Paper: <strong>${fullPaperTitle}</strong>, and as Paper Code: <strong>${courseCode || 'N/A'}</strong> 
        for the upcoming examinations for the Program/Semester/Year: <strong>${progSemYear}</strong>.
      </p>

      <!-- Portal Credentials Box -->
      <p style="margin: 0 0 4px 0;">
        <strong>2.</strong> You can access your assigned examination dashboard and complete question paper activities directly via the official portal using the credentials below:
      </p>
      <div style="margin: 8px 0 14px 20px; padding: 12px 16px; background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6;">
        <div><strong>Portal URL:</strong> <a href="${portalUrl}" target="_blank" style="color: #15803d; font-weight: bold; text-decoration: underline;">${portalUrl}</a></div>
        <div><strong>User ID / Login:</strong> <span style="font-family: monospace; font-weight: bold; background: #dcfce7; padding: 2px 6px; border-radius: 3px;">${userId}</span></div>
        <div><strong>Password:</strong> <span style="font-family: monospace; font-weight: bold; background: #dcfce7; padding: 2px 6px; border-radius: 3px;">${password}</span></div>
      </div>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>3.</strong> ${isModerator
          ? "You are requested to review and moderate the question papers, ensure balanced difficulty, verify course outcome mappings, and confirm model answers/marking scheme as per university guidelines."
          : "You are requested to frame One Set (i.e., Two Papers—Main and ATKT/Suppl.) of Question Paper strictly as per the prescribed question paper template and syllabus."
        }
      </p>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>4.</strong> If any Multiple Choice Questions (MCQs) are present in the question paper, then you need to provide and mark the correct options/answers of the MCQs.
      </p>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>5.</strong> You can submit the question paper directly through the examination portal <a href="${portalUrl}" style="color: #1d4ed8;">${portalUrl}</a>${instEmail ? `, or send password-protected (.docx) files of question papers (Main &amp; ATKT/Suppl.) to <a href="mailto:${instEmail}" style="color: #1d4ed8;">${instEmail}</a>` : ""} within 7 days of receipt.
      </p>

      <p style="margin: 0 0 10px 0; text-align: justify;">
        <strong>6.</strong> Kindly provide correct details of Account No., IFSC Code, and PAN No. in the Remuneration Bill section on the portal and upload a scanned copy of cancelled cheque/passbook for timely transfer of remuneration amount.
      </p>

      <p style="margin: 0 0 12px 0; text-align: justify;">
        <strong>7.</strong> The remuneration amount will be transferred to your bank account within 45-60 days from the date of paper receipt.
      </p>
      `}

      <p style="margin: 0 0 20px 0; font-style: italic;">
        Kindly go through the entire points of appointment letter.
      </p>

    </div>

    <!-- Sign-off Block with Dynamic COE / Assistant Registrar -->
    <table style="width: 100%; margin-top: 15px; border-collapse: collapse;">
      <tr>
        <td style="width: 50%;"></td>
        <td style="width: 50%; text-align: right; font-size: 13px; line-height: 1.5;">
          Yours faithfully<br/><br/>
          (Signature)<br/><br/>
          <strong>${coeTitle}</strong><br/>
          Ph.No.- ${instContact || '0755-4005402'}
        </td>
      </tr>
    </table>

    <!-- Remuneration Note & Enclosures -->
    <div style="margin-top: 24px; padding-top: 10px; border-top: 1px dashed #9ca3af; font-size: 11px; color: #374151; line-height: 1.5;">
      ${isEvaluator ? `
      <strong><u>Note: Evaluation Instructions:</u></strong><br/>
      • Valuation per script as per the approved Examiner Rate Card.<br/>
      • Minimum 30 scripts to be evaluated per day.<br/>
      • Evaluation must strictly follow prescribed scheme of valuation.<br/><br/>
      <strong><u>Enclosures:</u></strong><br/>
      • Acceptance Form &amp; Declaration Form (accessible on On-Screen Marking portal).<br/>
      • Scheme of valuation / Model answer key.<br/>
      • Remuneration Bill format.
      ` : `
      <strong><u>Note: Remuneration Rates:</u></strong><br/>
      • Setting of the one set (i.e., Two Papers—Main and ATKT/Suppl.) of question paper for Diploma/UG = Rs.1000/-<br/>
      • Setting of the one set (i.e., Two Papers—Main and ATKT/Suppl.) of question paper for PG = Rs.1500/-<br/>
      • Setting of the one set (i.e., Two Papers—Main and ATKT/Suppl.) of question paper for Ph.D. = Rs.2000/-
      <br/><br/>
      <strong><u>Enclosures:</u></strong><br/>
      • Question Paper Template / Sample Paper (having maximum marks, time duration and pattern).<br/>
      • Syllabus prescribed for the paper.<br/>
      • Acceptance form, Declaration form, Remuneration Bill form.
      `}
    </div>

  </div>
</body>
</html>`;
}

/**
 * Sends official appointment letter email to paper setter, moderator, or evaluator.
 */
async function sendAppointmentLetterEmail({ colid, type = "papersetter", record = {} }) {
  const isEvaluator = String(type).toLowerCase().includes("evaluat") || String(type).toLowerCase().includes("examiner");
  const isModerator = !isEvaluator && String(type).toLowerCase().includes("moderator");
  const recipientName = cleanText(record.examinername || record.papersettername || record.moderatorname || record.name);
  const recipientEmail = cleanText(record.examineremail || record.papersetteremail || record.moderatoremail || record.email).toLowerCase();

  if (!recipientEmail || !/\S+@\S+\.\S+/.test(recipientEmail)) {
    return { success: false, message: "Invalid or missing recipient email address." };
  }

  // 1. Load Institution Details from Exam Configuration
  const institution = await loadInstitutionDetails(colid);
  const instName = institution.institutionname || "Institution";

  // 2. Ensure / Provision User Account & Retrieve Credentials
  const userResult = await getOrProvisionUser(colid, recipientName, recipientEmail, isEvaluator ? "Faculty" : "Faculty", record);
  const userId = userResult?.userId || recipientEmail;
  const password = userResult?.password || "Welcome@123";
  const portalUrl = "https://campustechnology.me";

  // 3. Generate Reference & Tracking Numbers
  const currentYear = new Date().getFullYear();
  const seq = String(Date.now()).slice(-4);
  const codePrefix = isEvaluator ? "EV" : isModerator ? "MOD" : "PS";
  const instPrefix = (instName || "EXAM").split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 4).toUpperCase() || "EXAM";
  const refNo = isEvaluator
    ? `${instPrefix}/COE/ER/R/AL/${currentYear}/${seq}`
    : `${instPrefix}/COE/Conf/${codePrefix}/${currentYear}/${seq}`;
  const examinerCode = `${codePrefix}-${cleanText(record.coursecode || 'EXAM').toUpperCase()}-${seq}`;
  const confNo = `X/${currentYear}/${seq}/A`;
  const letterDate = formatDate();

  // 4. Construct Letter HTML
  const letterHtml = generateAppointmentLetterHtml({
    institution,
    recipientName,
    recipientEmail,
    recipientDesignation: record.designation || "Professor & Head",
    recipientDept: record.department || record.program,
    courseName: record.course,
    courseCode: record.coursecode,
    subject: record.subject,
    program: record.program,
    semester: record.semester,
    academicYear: record.academicyear,
    examName: record.exam,
    examCode: record.examcode,
    userId,
    password,
    portalUrl,
    isModerator,
    isEvaluator,
    refNo,
    examinerCode,
    confNo,
    date: letterDate
  });

  const subjectRole = isEvaluator ? "Evaluator" : isModerator ? "Moderator" : "Paper-Setter";
  const subject = `Appointment as ${subjectRole} - ${record.coursecode || ''} (${instName})`;

  const plainText = `
${instName.toUpperCase()}
MOST CONFIDENTIAL & URGENT
Ref. No: ${refNo} | Date: ${letterDate}

Subject: Appointment as ${subjectRole}
To: ${recipientName} (${recipientEmail})

Dear Sir/Madam,
With the approval of the Vice Chancellor of the University, an assignment as ${subjectRole} is offered to you for Subject/Paper: ${record.course || record.subject} (${record.coursecode}) for ${record.program || ''} ${record.semester || ''} ${record.academicyear || ''}.

YOUR PORTAL LOGIN CREDENTIALS:
Portal URL: ${portalUrl}
User ID: ${userId}
Password: ${password}

Please log in to ${portalUrl} to complete your acceptance form, sign the declaration, and conduct evaluation under On-Screen Marking.

${isEvaluator ? 'Assistant Registrar (Evaluation)' : 'Office of COE'}
${instName}
`;

  // 5. Load Email Config & Send
  const emailConfig = await loadEmailConfig(colid);
  if (!emailConfig?.username || !emailConfig?.password) {
    console.warn(`[AppointmentEmailHelper] No active email config found for colid ${colid}. Letter generated but email not dispatched.`);
    return {
      success: true,
      emailSent: false,
      message: "Appointment letter prepared and user account ready, but no active Email Configuration was found in system settings.",
      recipient: recipientEmail,
      userId,
      password,
      portalUrl,
      refNo
    };
  }

  try {
    const smtpHost = emailConfig.smtp || (emailConfig.provider && /gmail/i.test(emailConfig.provider) ? "smtp.gmail.com" : "smtp.gmail.com");
    const port = Number(emailConfig.port) || 465;
    const secure = port === 465 || String(emailConfig.secure).toLowerCase() === "yes";

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      auth: {
        user: emailConfig.username,
        pass: emailConfig.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.sendMail({
      from: `"${instName} Examination Cell" <${emailConfig.username}>`,
      to: recipientEmail,
      subject,
      text: plainText,
      html: letterHtml
    });

    console.log(`[AppointmentEmailHelper] Appointment letter email successfully sent to ${recipientEmail}`);
    return {
      success: true,
      emailSent: true,
      message: `Appointment letter sent successfully to ${recipientEmail}.`,
      recipient: recipientEmail,
      userId,
      password,
      portalUrl,
      refNo
    };
  } catch (err) {
    console.error("[AppointmentEmailHelper] Failed to send email via transporter:", err.message);
    return {
      success: true,
      emailSent: false,
      message: `Appointment letter generated, but email delivery encountered an issue: ${err.message}`,
      recipient: recipientEmail,
      userId,
      password,
      portalUrl,
      refNo
    };
  }
}

module.exports = {
  getOrProvisionUser,
  loadInstitutionDetails,
  loadEmailConfig,
  generateAppointmentLetterHtml,
  sendAppointmentLetterEmail
};
