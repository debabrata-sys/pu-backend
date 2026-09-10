const ConductExamRemuneration = require("../Models/conductexamremuneration2ds");
const ConductExamBill = require("../Models/conductexambill2ds");
const ConductExamRateCard = require("../Models/conductexamratecard2ds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamFormSubmission = require("../Models/conductexamformsubmissionds");
const ConductExamPaperSetter = require("../Models/conductexampapersetter2ds");
const ConductExamModerator = require("../Models/conductexammoderator2ds");
const ConductExamExaminer = require("../Models/conductexamexaminerds");
const ConductExam = require("../Models/conductexamds");
const ConductExamInvigilatorAllocation = require("../Models/conductexaminvigilatorallocationds");
const ConductExamDates = require("../Models/conductexamdatesds");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const RegulationMaster = require("../Models/regulationmasterds");
const User = require("../Models/user");
const Institution = require("../Models/insdetails");
const { getExamConfigHelper } = require("./conductexamconfigurationctlrds");

const text = (value) => String(value || "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};
const uniq = (values) => [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Helper: convert number to Indian words
const numberToWords = (num) => {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ",
    "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ",
    "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return "Overflow";
    const nArr = ("000000000" + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArr) return "";
    let str = "";
    str += Number(nArr[1]) !== 0 ? (a[Number(nArr[1])] || `${b[nArr[1][0]]} ${a[nArr[1][1]]}`) + "Crore " : "";
    str += Number(nArr[2]) !== 0 ? (a[Number(nArr[2])] || `${b[nArr[2][0]]} ${a[nArr[2][1]]}`) + "Lakh " : "";
    str += Number(nArr[3]) !== 0 ? (a[Number(nArr[3])] || `${b[nArr[3][0]]} ${a[nArr[3][1]]}`) + "Thousand " : "";
    str += Number(nArr[4]) !== 0 ? (a[Number(nArr[4])] || `${b[nArr[4][0]]} ${a[nArr[4][1]]}`) + "Hundred " : "";
    str += Number(nArr[5]) !== 0 ? ((str !== "" ? "and " : "") + (a[Number(nArr[5])] || `${b[nArr[5][0]]} ${a[nArr[5][1]]}`)) : "";
    return str.trim();
  };

  const amount = Math.floor(Number(num) || 0);
  if (amount <= 0) return "Zero Rupees Only";
  return `Rupees ${inWords(amount)} Only`;
};

const getInstitution = async (colid) => {
  return getExamConfigHelper(colid);
};

// 1. Options for dropdowns (aggregating from Paper Setter, Moderator, Evaluator, Invigilator, and Course Masters)
exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const [
      remunerations,
      rateCards,
      courses,
      submissions,
      paperSetters,
      moderators,
      examiners,
      invigilators,
      exams,
      examDates,
      regulationCourses,
      regulationMasters,
      institution,
      users
    ] = await Promise.all([
      ConductExamRemuneration.find({ colid }).lean(),
      ConductExamRateCard.find({ colid }).lean(),
      ConductExamCourse.find({ colid }).lean(),
      ConductExamFormSubmission.find({ colid }).select("academicyear exam examcode program programcode courses semester").lean(),
      ConductExamPaperSetter.find({ colid }).lean(),
      ConductExamModerator.find({ colid }).lean(),
      ConductExamExaminer.find({ colid }).lean(),
      ConductExamInvigilatorAllocation.find({ colid }).lean(),
      ConductExam.find({ colid }).lean(),
      ConductExamDates.find({ colid }).lean(),
      RegulationCourseMap.find({ colid }).lean(),
      RegulationMaster.find({ colid }).lean(),
      getInstitution(colid),
      User.find({ colid, role: { $not: /^Student$/i } })
        .select("name email role department phone designation qualification address")
        .sort({ name: 1, email: 1 })
        .lean()
    ]);

    // Build unified master course list from all sources
    const courseCatalog = new Map();

    const addCourseEntry = (c, roleTag = "") => {
      const code = text(c.coursecode || c.papercode);
      const name = text(c.course || c.papername);
      if (!code && !name) return;

      const year = text(c.academicyear);
      const examcode = text(c.examcode);
      const regulation = text(c.regulation);
      const programcode = text(c.programcode);
      const semester = text(c.semester);

      const key = `${year}__${examcode}__${regulation}__${programcode}__${semester}__${code || name}`.toLowerCase();

      if (!courseCatalog.has(key)) {
        courseCatalog.set(key, {
          academicyear: year,
          exam: text(c.exam),
          examcode,
          regulation,
          program: text(c.program) || programcode,
          programcode,
          department: text(c.department || c.subject),
          semester,
          course: name || code,
          coursecode: code || name,
          papername: name || code,
          papercode: code || name,
          type: text(c.type) || "Major",
          subject: text(c.subject || c.department),
          coursetype: text(c.coursetype) || "Theory",
          examdate: text(c.examdate ? (c.examdate.toISOString ? c.examdate.toISOString().slice(0, 10) : String(c.examdate).slice(0, 10)) : ""),
          roles: roleTag ? [roleTag] : []
        });
      } else {
        const existing = courseCatalog.get(key);
        if (roleTag && !existing.roles.includes(roleTag)) {
          existing.roles.push(roleTag);
        }
        if (!existing.department && (c.department || c.subject)) existing.department = text(c.department || c.subject);
        if (!existing.examdate && c.examdate) {
          existing.examdate = text(c.examdate.toISOString ? c.examdate.toISOString().slice(0, 10) : String(c.examdate).slice(0, 10));
        }
        if (!existing.exam && c.exam) existing.exam = text(c.exam);
        if (!existing.program && c.program) existing.program = text(c.program);
        if (!existing.regulation && c.regulation) existing.regulation = text(c.regulation);
      }
    };

    // Populate from all modules
    (courses || []).forEach((c) => addCourseEntry(c, "Course Master"));
    (paperSetters || []).forEach((c) => addCourseEntry(c, "Paper Setter"));
    (moderators || []).forEach((c) => addCourseEntry(c, "Moderator"));
    (examiners || []).forEach((c) => addCourseEntry(c, "Evaluator"));
    (rateCards || []).forEach((c) => addCourseEntry(c, "Rate Card"));
    (remunerations || []).forEach((c) => addCourseEntry(c, "Staff Registry"));
    (regulationCourses || []).forEach((c) => addCourseEntry(c, "Curriculum Map"));
    (submissions || []).forEach((sub) => {
      (sub.courses || []).forEach((c) => {
        addCourseEntry({
          academicyear: sub.academicyear,
          exam: sub.exam,
          examcode: sub.examcode,
          program: sub.program,
          programcode: sub.programcode,
          semester: sub.semester,
          ...c
        }, "Exam Forms");
      });
    });

    const allCourses = [...courseCatalog.values()];

    // Build lookup for exam dates regulations
    const examDateRegMap = new Map();
    (examDates || []).forEach((ed) => {
      if (ed.examcode && ed.regulation) examDateRegMap.set(ed.examcode, text(ed.regulation));
    });

    // Exams list
    const examsMap = new Map();
    [...courses, ...examDates, ...exams, ...paperSetters, ...moderators, ...examiners, ...invigilators, ...remunerations].forEach((row) => {
      const code = text(row.examcode);
      const name = text(row.exam || row.examname) || code;
      const year = text(row.academicyear);
      const reg = text(row.regulation) || examDateRegMap.get(code) || "";
      const progCode = text(row.programcode);
      const progName = text(row.program);
      const sem = text(row.semester);

      if (code && !examsMap.has(code)) {
        examsMap.set(code, {
          examcode: code,
          exam: name,
          academicyear: year,
          regulation: reg,
          programcode: progCode,
          program: progName,
          semester: sem
        });
      } else if (code) {
        const entry = examsMap.get(code);
        if (!entry.regulation && reg) entry.regulation = reg;
        if (!entry.programcode && progCode) entry.programcode = progCode;
        if (!entry.program && progName) entry.program = progName;
        if (!entry.semester && sem) entry.semester = sem;
      }
    });

    // Infer regulation, program, and semester for exams where not directly saved (e.g. ATKT matching regular exam)
    examsMap.forEach((ex) => {
      const baseName = ex.exam.replace(/_(ATKT|MAIN|SUPPL).*$/i, "").trim().toLowerCase();
      const baseCode = ex.examcode.replace(/(ATKT|SUPPL)/i, "").trim().toLowerCase();
      const match = [...examsMap.values()].find((other) => other.examcode !== ex.examcode && (
        (baseName && other.exam.toLowerCase().includes(baseName)) ||
        (baseCode && other.examcode.toLowerCase().includes(baseCode))
      ));
      if (match) {
        if (!ex.regulation && match.regulation) ex.regulation = match.regulation;
        if (!ex.programcode && match.programcode) ex.programcode = match.programcode;
        if (!ex.program && match.program) ex.program = match.program;
        if (!ex.semester && match.semester) ex.semester = match.semester;
      }
    });

    // Programs list
    const programsMap = new Map();
    allCourses.forEach((row) => {
      const code = text(row.programcode);
      const name = text(row.program) || code;
      if (code && !programsMap.has(code)) {
        programsMap.set(code, { programcode: code, program: name });
      }
    });

    // Regulations list from RegulationMaster (for this college), RegulationCourseMap, and all course records
    const colidRegMasters = (regulationMasters || []).map((r) => text(r.regulation)).filter(Boolean);
    const colidCourseRegs = allCourses.map((r) => text(r.regulation)).filter(Boolean);
    const colidExamRegs = [...exams, ...examDates].map((r) => text(r.regulation)).filter(Boolean);
    const colidRegCourseRegs = (regulationCourses || []).map((r) => text(r.regulation)).filter(Boolean);

    let regulations = uniq([
      ...colidRegMasters,
      ...colidRegCourseRegs,
      ...colidCourseRegs,
      ...colidExamRegs
    ]);

    if (regulations.length === 0) {
      const distinctRegs = await RegulationMaster.distinct("regulation");
      regulations = uniq(distinctRegs.map(text).filter(Boolean));
    }

    // Semesters list: dynamically 1 to 10 (not hardcoded)
    const semesters = Array.from({ length: 10 }, (_, i) => String(i + 1));

    // Academic years
    const academicyears = uniq([
      ...allCourses.map((r) => r.academicyear),
      ...exams.map((r) => r.academicyear),
      "2026-27",
      "2025-26",
      "2024-25"
    ]);

    res.json({
      success: true,
      academicyears,
      exams: [...examsMap.values()].sort((a, b) => a.examcode.localeCompare(b.examcode)),
      examcodes: [...examsMap.keys()].sort((a, b) => a.localeCompare(b)),
      regulations,
      programs: [...programsMap.values()].sort((a, b) => a.program.localeCompare(b.program)),
      semesters,
      courses: allCourses.sort((a, b) => a.course.localeCompare(b.course)),
      roleCategories: ["Evaluator", "Paper Setter", "Moderator", "Invigilator"],
      staffTypes: ["Internal", "External"],
      examTypes: ["Main", "Suppl.", "ATKT", "Regular"],
      departments: uniq(allCourses.map((r) => r.department)),
      institution,
      users: users || []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. List Examiners / Staff
exports.getExaminers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) query.examcode = text(req.query.examcode);
    if (text(req.query.rolecategory)) query.rolecategory = text(req.query.rolecategory);
    if (text(req.query.stafftype)) query.stafftype = text(req.query.stafftype);
    if (text(req.query.programcode)) query.programcode = text(req.query.programcode);
    if (text(req.query.coursecode)) query.coursecode = text(req.query.coursecode);

    const data = await ConductExamRemuneration.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Save / Update Examiner
exports.saveExaminer = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const {
      id,
      academicyear,
      regulation,
      exam,
      examcode,
      program,
      programcode,
      department,
      semester,
      examtype,
      course,
      coursecode,
      papername,
      papercode,
      examdate,
      examinername,
      examineremail,
      designation,
      instituteaddress,
      contactno,
      qualification,
      specialization,
      experience_ug,
      experience_pg,
      rolecategory,
      stafftype,
      bankname,
      bankbranch,
      accountno,
      ifsccode,
      panno,
      assignedcount,
      customrate,
      user
    } = req.body;

    if (!text(examinername) || !text(examineremail)) {
      return res.status(400).json({ success: false, message: "Examiner name and email are required" });
    }
    if (!text(academicyear) || !text(examcode)) {
      return res.status(400).json({ success: false, message: "Academic Year and Exam Code are required" });
    }

    const payload = {
      colid,
      academicyear: text(academicyear),
      regulation: text(regulation),
      exam: text(exam),
      examcode: text(examcode),
      program: text(program),
      programcode: text(programcode),
      department: text(department),
      semester: text(semester),
      examtype: text(examtype) || "Main",
      course: text(course) || text(papername),
      coursecode: text(coursecode) || text(papercode),
      papername: text(papername) || text(course),
      papercode: text(papercode) || text(coursecode),
      examdate: text(examdate),
      examinername: text(examinername),
      examineremail: text(examineremail),
      designation: text(designation),
      instituteaddress: text(instituteaddress),
      contactno: text(contactno),
      qualification: text(qualification),
      specialization: text(specialization),
      experience_ug: text(experience_ug) || "0",
      experience_pg: text(experience_pg) || "0",
      rolecategory: text(rolecategory) || "Evaluator",
      stafftype: text(stafftype) || "External",
      bankname: text(bankname),
      bankbranch: text(bankbranch),
      accountno: text(accountno),
      ifsccode: text(ifsccode),
      panno: text(panno),
      assignedcount: number(assignedcount, 0),
      customrate: number(customrate, 0),
      user: text(user)
    };

const syncAssignedWork = async (item) => {
  try {
    const colid = number(item.colid);
    const role = text(item.rolecategory);
    const email = text(item.examineremail).toLowerCase();
    const name = text(item.examinername);
    const course = text(item.course || item.papername);
    const coursecode = text(item.coursecode || item.papercode);
    const examcode = text(item.examcode);
    const academicyear = text(item.academicyear);
    const regulation = text(item.regulation) || "Standard";
    const exam = text(item.exam) || examcode;
    const program = text(item.program) || "General";
    const programcode = text(item.programcode) || "GEN";
    const department = text(item.department);
    const semester = text(item.semester) || "Semester 1";

    if (!colid || !email || !coursecode || !examcode) return;

    if (role === "Paper Setter") {
      // Sync into ConductExamPaperSetter so they can submit question papers in Question Paper Management
      await ConductExamPaperSetter.findOneAndUpdate(
        {
          colid,
          academicyear,
          examcode,
          programcode,
          coursecode,
          papersetteremail: email
        },
        {
          $set: {
            colid,
            academicyear,
            regulation,
            exam,
            examcode,
            program,
            programcode,
            department,
            semester,
            course,
            coursecode,
            papersettername: name,
            papersetteremail: email,
            status: "assigned",
            user: text(item.user)
          }
        },
        { upsert: true, new: true }
      );
    } else if (role === "Moderator") {
      // Sync into ConductExamModerator so they can moderate question papers in Moderation module
      await ConductExamModerator.findOneAndUpdate(
        {
          colid,
          academicyear,
          examcode,
          programcode,
          coursecode,
          moderatoremail: email
        },
        {
          $set: {
            colid,
            academicyear,
            regulation,
            exam,
            examcode,
            program,
            programcode,
            department,
            semester,
            course,
            coursecode,
            moderatorname: name,
            moderatoremail: email,
            status: "assigned",
            user: text(item.user)
          }
        },
        { upsert: true, new: true }
      );
    } else if (role === "Evaluator") {
      // Sync into ConductExamExaminer so they can evaluate answer sheets and enter marks
      await ConductExamExaminer.findOneAndUpdate(
        {
          colid,
          academicyear,
          examcode,
          programcode,
          coursecode,
          examineremail: email
        },
        {
          $set: {
            colid,
            academicyear,
            regulation,
            exam,
            examcode,
            program,
            programcode,
            department,
            semester,
            course,
            coursecode,
            examinername: name,
            examineremail: email,
            user: text(item.user)
          }
        },
        { upsert: true, new: true }
      );
    } else if (role === "Invigilator") {
      // Sync into ConductExamInvigilatorAllocation for exam hall duty
      await ConductExamInvigilatorAllocation.findOneAndUpdate(
        {
          colid,
          academicyear,
          examcode,
          invigilatoremail: email
        },
        {
          $set: {
            colid,
            academicyear,
            regulation,
            exam,
            examcode,
            campus: "Main Campus",
            building: "Examination Center",
            room: "Exam Hall",
            invigilator: name,
            invigilatoremail: email,
            examdate: text(item.examdate) || new Date().toISOString().slice(0, 10),
            slot: "Morning",
            user: text(item.user)
          }
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.error("Error in syncAssignedWork:", err.message);
  }
};

    let doc;
    if (id) {
      doc = await ConductExamRemuneration.findOneAndUpdate({ _id: id, colid }, { $set: payload }, { new: true });
    } else {
      doc = await ConductExamRemuneration.create(payload);
    }

    // Automatically enable user to do the work in Paper Setter, Moderator, or Evaluator modules
    await syncAssignedWork(payload);

    res.json({ success: true, message: "Examiner registered successfully", data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Bulk Upload Examiners
exports.bulkExaminers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: "No items provided for bulk upload" });

    const docsToInsert = items.map((item) => ({
      colid,
      academicyear: text(item.academicyear || req.body.academicyear),
      regulation: text(item.regulation || req.body.regulation),
      exam: text(item.exam || req.body.exam),
      examcode: text(item.examcode || req.body.examcode),
      program: text(item.program || req.body.program),
      programcode: text(item.programcode || req.body.programcode),
      department: text(item.department),
      semester: text(item.semester),
      examtype: text(item.examtype) || "Main",
      course: text(item.course || item.papername),
      coursecode: text(item.coursecode || item.papercode),
      papername: text(item.papername || item.course),
      papercode: text(item.papercode || item.coursecode),
      examdate: text(item.examdate),
      examinername: text(item.examinername || item.name),
      examineremail: text(item.examineremail || item.email),
      designation: text(item.designation),
      instituteaddress: text(item.instituteaddress || item.address),
      contactno: text(item.contactno || item.phone),
      qualification: text(item.qualification),
      specialization: text(item.specialization),
      experience_ug: text(item.experience_ug) || "0",
      experience_pg: text(item.experience_pg) || "0",
      rolecategory: text(item.rolecategory) || "Evaluator",
      stafftype: /internal/i.test(text(item.stafftype)) ? "Internal" : "External",
      bankname: text(item.bankname),
      bankbranch: text(item.bankbranch),
      accountno: text(item.accountno),
      ifsccode: text(item.ifsccode),
      panno: text(item.panno),
      assignedcount: number(item.assignedcount, 0),
      customrate: number(item.customrate, 0),
      user: text(req.body.user)
    })).filter((d) => d.examinername && d.examineremail);

    if (!docsToInsert.length) {
      return res.status(400).json({ success: false, message: "No valid rows found in payload" });
    }

    const inserted = await ConductExamRemuneration.insertMany(docsToInsert);
    await Promise.all(docsToInsert.map((d) => syncAssignedWork(d)));
    res.json({ success: true, count: inserted.length, message: `Successfully registered ${inserted.length} examiners` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Delete Examiner
exports.deleteExaminer = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body.id;
    if (!colid || !id) return res.status(400).json({ success: false, message: "colid and id are required" });

    await ConductExamRemuneration.deleteOne({ _id: id, colid });
    res.json({ success: true, message: "Examiner deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Calculate Remuneration Summary with Internal/External Rules
// Core Rule:
// - Evaluator: Institution pays for ALL (both Internal and External).
// - Paper Setter: Institution pays ONLY IF EXTERNAL. If Internal -> Rs. 0 / Non-Payable.
// - Moderator: Institution pays ONLY IF EXTERNAL. If Internal -> Rs. 0 / Non-Payable.
// - Invigilator: Institution pays ONLY IF EXTERNAL.
exports.calculatePayment = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) query.examcode = text(req.query.examcode);
    if (text(req.query.rolecategory)) query.rolecategory = text(req.query.rolecategory);
    if (text(req.query.stafftype)) query.stafftype = text(req.query.stafftype);

    const [staffList, rateCards, institution, generatedBills] = await Promise.all([
      ConductExamRemuneration.find(query).sort({ examinername: 1 }).lean(),
      ConductExamRateCard.find({ colid, status: /^Active$/i }).lean(),
      getInstitution(colid),
      ConductExamBill.find({ colid }).select("billno examineremail papercode grandTotal status").lean()
    ]);

    // Build rate lookup map
    const rateMap = new Map();
    rateCards.forEach((rc) => {
      const key = [rc.academicyear, rc.examcode, rc.programcode, rc.coursecode].map(text).join("|");
      rateMap.set(key, rc);
    });

    // Build generated bills lookup map
    const billMap = new Map();
    generatedBills.forEach((b) => {
      const key = `${text(b.examineremail).toLowerCase()}|${text(b.papercode)}`;
      billMap.set(key, b);
    });

    let totalPayableAmount = 0;
    let totalNonPayableAmount = 0;
    let payableCount = 0;
    let nonPayableCount = 0;
    let evaluatorsPayable = 0;
    let externalSettersPayable = 0;
    let externalModeratorsPayable = 0;

    const data = staffList.map((staff) => {
      const role = staff.rolecategory || "Evaluator";
      const isExternal = /^External$/i.test(staff.stafftype);
      const isInternal = !isExternal;

      // Rate Card lookup
      const rateKey = [staff.academicyear, staff.examcode, staff.programcode, staff.coursecode].map(text).join("|");
      const matchedRateCard = rateMap.get(rateKey) || {};

      // Determine default rate based on role
      let unitRate = staff.customrate || 0;
      if (!unitRate) {
        if (role === "Paper Setter") unitRate = matchedRateCard.papersetterrate || 1500;
        else if (role === "Moderator") unitRate = matchedRateCard.moderatorrate || 1000;
        else if (role === "Evaluator") unitRate = matchedRateCard.examinerrate || 40; // per copy
        else if (role === "Invigilator") unitRate = 600; // per session
        else unitRate = 500;
      }

      const count = staff.assignedcount || (role === "Evaluator" ? 30 : 1); // standard sample count if not explicitly entered
      const grossAmount = count * unitRate;

      // APPLY CORE BUSINESS LOGIC
      let isPayable = false;
      let nonPayableReason = "";
      let netPayableAmount = 0;

      if (role === "Evaluator") {
        // Evaluator is ALWAYS paid (both Internal and External)
        isPayable = true;
        netPayableAmount = grossAmount;
        nonPayableReason = "";
        evaluatorsPayable += netPayableAmount;
      } else if (role === "Paper Setter") {
        if (isExternal) {
          isPayable = true;
          netPayableAmount = grossAmount;
          nonPayableReason = "";
          externalSettersPayable += netPayableAmount;
        } else {
          isPayable = false;
          netPayableAmount = 0;
          nonPayableReason = "Internal Paper Setter - Institution does not provide remuneration as per policy";
        }
      } else if (role === "Moderator") {
        if (isExternal) {
          isPayable = true;
          netPayableAmount = grossAmount;
          nonPayableReason = "";
          externalModeratorsPayable += netPayableAmount;
        } else {
          isPayable = false;
          netPayableAmount = 0;
          nonPayableReason = "Internal Moderator - Institution does not provide remuneration as per policy";
        }
      } else if (role === "Invigilator") {
        if (isExternal) {
          isPayable = true;
          netPayableAmount = grossAmount;
          nonPayableReason = "";
        } else {
          isPayable = false;
          netPayableAmount = 0;
          nonPayableReason = "Internal Invigilator - Regular institutional duty";
        }
      }

      if (isPayable) {
        totalPayableAmount += netPayableAmount;
        payableCount += 1;
      } else {
        totalNonPayableAmount += grossAmount;
        nonPayableCount += 1;
      }

      const existingBill = billMap.get(`${text(staff.examineremail).toLowerCase()}|${text(staff.papercode)}`);

      return {
        _id: staff._id,
        examinername: staff.examinername,
        examineremail: staff.examineremail,
        designation: staff.designation,
        instituteaddress: staff.instituteaddress,
        contactno: staff.contactno,
        qualification: staff.qualification,
        specialization: staff.specialization,
        experience_ug: staff.experience_ug,
        experience_pg: staff.experience_pg,
        rolecategory: role,
        stafftype: staff.stafftype,
        academicyear: staff.academicyear,
        exam: staff.exam,
        examcode: staff.examcode,
        program: staff.program,
        programcode: staff.programcode,
        department: staff.department,
        semester: staff.semester,
        papername: staff.papername || staff.course,
        papercode: staff.papercode || staff.coursecode,
        examdate: staff.examdate,
        bankname: staff.bankname,
        bankbranch: staff.bankbranch,
        accountno: staff.accountno,
        ifsccode: staff.ifsccode,
        panno: staff.panno,
        count,
        unitRate,
        grossAmount,
        netPayableAmount,
        isPayable,
        nonPayableReason,
        billGenerated: Boolean(existingBill),
        billno: existingBill?.billno || "",
        billStatus: existingBill?.status || ""
      };
    });

    res.json({
      success: true,
      data,
      totals: {
        totalPayableAmount,
        totalNonPayableAmount,
        payableCount,
        nonPayableCount,
        totalStaff: staffList.length,
        evaluatorsPayable,
        externalSettersPayable,
        externalModeratorsPayable
      },
      institution
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Generate / Save 2-Page Remuneration Bill
exports.generateBill = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const staffId = req.body.staffId || req.body.examinerid;
    let staff = null;
    if (staffId) {
      staff = await ConductExamRemuneration.findOne({ _id: staffId, colid }).lean();
    }

    const examinername = text(req.body.examinername || staff?.examinername);
    const examineremail = text(req.body.examineremail || staff?.examineremail);
    const rolecategory = text(req.body.rolecategory || staff?.rolecategory || "Evaluator");
    const stafftype = text(req.body.stafftype || staff?.stafftype || "External");
    const isExternal = /^External$/i.test(stafftype);

    // Bill Number generation
    const yearPart = new Date().getFullYear();
    const countBills = await ConductExamBill.countDocuments({ colid });
    const billno = req.body.billno || `BILL/PU/${yearPart}/${String(countBills + 1).padStart(4, "0")}`;

    // Standard Assignment entries
    const customAssignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    let assignments = customAssignments;
    if (!assignments.length) {
      const count = number(req.body.count || staff?.assignedcount, rolecategory === "Evaluator" ? 30 : 1);
      const rate = number(req.body.unitRate || staff?.customrate, rolecategory === "Paper Setter" ? 1500 : (rolecategory === "Moderator" ? 1000 : 40));

      let settingCount = 0;
      let settingRate = 0;
      let settingAmount = 0;

      let evalCount = 0;
      let evalRate = 0;
      let evalAmount = 0;

      let pracCount = 0;
      let pracRate = 0;
      let pracAmount = 0;

      let postalAmount = number(req.body.postalCharges, 0);

      if (rolecategory === "Paper Setter" || rolecategory === "Moderator") {
        settingCount = count;
        settingRate = rate;
        settingAmount = isExternal ? (settingCount * settingRate) : 0;
      } else if (rolecategory === "Evaluator") {
        evalCount = count;
        evalRate = rate;
        evalAmount = evalCount * evalRate; // Paid for ALL
      }

      assignments = [
        {
          name: "Setting of Questions Papers/Translation/Moderation",
          count: settingCount,
          rate: settingRate,
          amount: settingAmount
        },
        {
          name: "Evaluation / Revaluation/ Retotaling of answer book/thesis",
          count: evalCount,
          rate: evalRate,
          amount: evalAmount
        },
        {
          name: "Practical / Clinical Examination / Viva-Voce /Misc.",
          count: pracCount,
          rate: pracRate,
          amount: pracAmount
        },
        {
          name: "Postal Charges* etc. (Receipt to be enclosed)",
          count: 0,
          rate: 0,
          amount: postalAmount
        }
      ];
    }

    const assignmentTotal = assignments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    // Traveling entries
    const travelDetails = Array.isArray(req.body.travelDetails) ? req.body.travelDetails : [];
    const travelTotal = travelDetails.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const grandTotal = assignmentTotal + travelTotal;
    const grandTotalWords = numberToWords(grandTotal);

    // Determine payability flag
    const isPayable = rolecategory === "Evaluator" ? true : isExternal;
    const nonPayableReason = isPayable ? "" : `Internal ${rolecategory} - Institution policy does not provide remuneration`;

    const payload = {
      colid,
      billno,
      vno: text(req.body.vno),
      billdate: text(req.body.billdate) || new Date().toISOString().split("T")[0],

      examinerid: staff?._id,
      examinername,
      examineremail,
      designation: text(req.body.designation || staff?.designation),
      instituteaddress: text(req.body.instituteaddress || staff?.instituteaddress),
      contactno: text(req.body.contactno || staff?.contactno),
      qualification: text(req.body.qualification || staff?.qualification),
      specialization: text(req.body.specialization || staff?.specialization),
      experience_ug: text(req.body.experience_ug || staff?.experience_ug || "0"),
      experience_pg: text(req.body.experience_pg || staff?.experience_pg || "0"),

      rolecategory,
      stafftype,

      academicyear: text(req.body.academicyear || staff?.academicyear),
      regulation: text(req.body.regulation || staff?.regulation),
      exam: text(req.body.exam || staff?.exam),
      examcode: text(req.body.examcode || staff?.examcode),
      program: text(req.body.program || staff?.program),
      programcode: text(req.body.programcode || staff?.programcode),
      department: text(req.body.department || staff?.department),
      semester: text(req.body.semester || staff?.semester),
      examtype: text(req.body.examtype || staff?.examtype || "Main"),
      papercode: text(req.body.papercode || staff?.papercode || staff?.coursecode),
      papername: text(req.body.papername || staff?.papername || staff?.course),
      examdate: text(req.body.examdate || staff?.examdate),

      assignments,
      travelDetails,
      assignmentTotal,
      travelTotal,
      grandTotal,
      grandTotalWords,

      bankname: text(req.body.bankname || staff?.bankname),
      bankbranch: text(req.body.bankbranch || staff?.bankbranch),
      accountno: text(req.body.accountno || staff?.accountno),
      ifsccode: text(req.body.ifsccode || staff?.ifsccode),
      panno: text(req.body.panno || staff?.panno),

      isPayable,
      nonPayableReason,

      cfaoPassAmount: grandTotal,
      cfaoPassAmountWords: grandTotalWords,

      paymentMode: text(req.body.paymentMode || "RTGS/NEFT"),
      chequeno: text(req.body.chequeno),
      paymentdate: text(req.body.paymentdate),
      paymentbank: text(req.body.paymentbank),

      status: text(req.body.status) || "Submitted",
      user: text(req.body.user)
    };

    let bill;
    if (req.body.id) {
      bill = await ConductExamBill.findOneAndUpdate({ _id: req.body.id, colid }, { $set: payload }, { new: true });
    } else {
      bill = await ConductExamBill.create(payload);
    }

    res.json({ success: true, message: "Bill generated successfully", data: bill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 8. List Generated Bills
exports.getBills = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) query.examcode = text(req.query.examcode);
    if (text(req.query.rolecategory)) query.rolecategory = text(req.query.rolecategory);
    if (text(req.query.stafftype)) query.stafftype = text(req.query.stafftype);

    const bills = await ConductExamBill.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: bills.length, data: bills });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 9. Get Single Bill for Viewing / Printing
exports.getBillById = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const id = req.params.id;
    if (!colid || !id) return res.status(400).json({ success: false, message: "colid and id are required" });

    const [bill, institution] = await Promise.all([
      ConductExamBill.findOne({ _id: id, colid }).lean(),
      getInstitution(colid)
    ]);

    if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });

    res.json({ success: true, data: bill, institution });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
