const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");
const ConductExamAnswerBook = require("../Models/conductexamanswerbook2ds");
const ConductExamReevaluation = require("../Models/conductexamreevaluation2ds");
const ConductExamExaminer = require("../Models/conductexamexaminer2ds");
const ConductExamQuestionPaper = require("../Models/conductexamquestionpaper2ds");
const ConductExamOnScreenMark = require("../Models/conductexamonscreenmark2ds");

const text = (v) => String(v || "").trim();
const colNumber = (v) => {
  const p = Number(v);
  return Number.isNaN(p) ? undefined : p;
};
const uniq = (arr = []) => [...new Set(arr.map((x) => text(x)).filter(Boolean))].sort();

// 1. Paper Valuation Status Summary Report (Top table in user's reference)
exports.getStatusSummaryReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);
    if (text(req.query.programcode)) filter.programcode = text(req.query.programcode);
    if (text(req.query.coursecode)) filter.coursecode = text(req.query.coursecode);

    const [allotments, answerBooks, revaluations] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamAnswerBook.find({ colid }).lean(),
      ConductExamReevaluation.find({ colid }).lean()
    ]);

    // Map answer books by coursecode -> Set of regnos
    const uploadedMap = new Map();
    answerBooks.forEach((b) => {
      const code = text(b.coursecode);
      if (!uploadedMap.has(code)) uploadedMap.set(code, new Set());
      if (b.regno) uploadedMap.get(code).add(text(b.regno));
    });

    // Map re-evaluations by coursecode -> list of reval records
    const revalMap = new Map();
    revaluations.forEach((r) => {
      const code = text(r.coursecode);
      if (!revalMap.has(code)) revalMap.set(code, []);
      revalMap.get(code).push(r);
    });

    // Group allotments by Course / Subject
    const courseGroups = new Map();
    allotments.forEach((a) => {
      const key = `${text(a.examcode)}||${text(a.coursecode)}`;
      if (!courseGroups.has(key)) {
        courseGroups.set(key, {
          exam: a.exam,
          examcode: a.examcode,
          academicyear: a.academicyear,
          program: a.program,
          programcode: a.programcode,
          course: a.course,
          coursecode: a.coursecode,
          subject: a.subject || a.course,
          allotments: []
        });
      }
      courseGroups.get(key).allotments.push(a);
    });

    const rows = [];
    let sno = 1;

    courseGroups.forEach((grp) => {
      const totalScripts = grp.allotments.length;
      const uploadedSet = uploadedMap.get(grp.coursecode) || new Set();
      const uploadedCount = grp.allotments.filter((a) => uploadedSet.has(text(a.regno))).length;
      const pendingUploads = Math.max(0, totalScripts - uploadedCount);

      // V1 Evaluation Status
      const v1Valuated = grp.allotments.filter((a) => (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null).length;
      const v1Afv = Math.max(0, totalScripts - v1Valuated); // Awaiting Final Valuation (V1 Pendency)

      // Re-evaluations for this course
      const courseRevals = revalMap.get(grp.coursecode) || [];
      const revalApplied = courseRevals.length;
      const v2Valuated = courseRevals.filter((r) => r.reevaluator1?.status === "Evaluated").length;
      const v2Afv = Math.max(0, revalApplied - v2Valuated); // V2 Pendency / AFV

      const v3Valuated = courseRevals.filter((r) => r.reevaluator2?.status === "Evaluated").length;
      const v3Afv = Math.max(0, revalApplied - v3Valuated); // V3 Pendency / AFV

      const v4Referred = courseRevals.filter(
        (r) => r.stage === "V3" || r.decision === "Referred to V4" || (r.reevaluator3 && r.reevaluator3.evaluatorId)
      );
      const v4Valuated = courseRevals.filter((r) => r.reevaluator3?.status === "Evaluated").length;
      const v4Pendency = Math.max(0, v4Referred.length - v4Valuated); // V4 Pendency
      const revalCompleted = courseRevals.filter((r) => r.status === "Completed").length;

      rows.push({
        sno: sno++,
        academicyear: grp.academicyear,
        examName: grp.exam,
        examCode: grp.examcode,
        courseName: grp.exam || grp.course,
        subjectCode: grp.coursecode,
        subjectName: grp.course,
        programName: grp.program,
        noScripts: totalScripts,
        uploaded: uploadedCount,
        pendingUploads,
        v1Valuated,
        afv: v1Afv,
        v1Afv,
        revalApplied,
        v2Valuated,
        v2Afv,
        v2Pendency: v2Afv,
        v3Valuated,
        v3Afv,
        v3Pendency: v3Afv,
        v4Valuated,
        v4Pendency,
        v4Afv: v4Pendency,
        revalCompleted,
        isAllV1Complete: v1Valuated >= totalScripts && totalScripts > 0,
        awardListUrl: `/conduct-exam-2-award-list?examcode=${encodeURIComponent(grp.examcode)}&coursecode=${encodeURIComponent(grp.coursecode)}`
      });
    });

    res.json({
      success: true,
      totalCourses: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Evaluator Quota & Progress Report (Bottom table in user's reference)
exports.getEvaluatorQuotaReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);
    if (text(req.query.coursecode)) filter.coursecode = text(req.query.coursecode);

    const [allotments, examiners] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamExaminer.find({ colid }).lean()
    ]);

    const examinerMap = new Map();
    examiners.forEach((e) => {
      const email = text(e.email || e.examineremail).toLowerCase();
      const code = text(e.examinercode || e.code || e.employeeid);
      if (email) examinerMap.set(email, e);
      if (code) examinerMap.set(code, e);
    });

    // Group allotments by evaluator email/id AND coursecode
    const evalCourseGroups = new Map();
    allotments.forEach((a) => {
      const evalEmail = text(a.examineremail).toLowerCase() || "unassigned";
      const evalId = text(a.evaluatorid || (evalEmail.includes("@") ? evalEmail.split("@")[0].toUpperCase() : evalEmail));
      const key = `${evalEmail}||${text(a.coursecode)}`;

      if (!evalCourseGroups.has(key)) {
        const ex = examinerMap.get(evalEmail) || examinerMap.get(evalId) || {};
        evalCourseGroups.set(key, {
          evaluatorId: evalId,
          evaluatorName: text(a.examinername || ex.name || "Examiner"),
          evaluatorEmail: evalEmail,
          institution: text(ex.institution || ex.collegename || ex.department || "People's University, Bhopal"),
          subjectCode: a.coursecode,
          subjectName: a.course,
          examCode: a.examcode,
          examName: a.exam,
          allotments: []
        });
      }
      evalCourseGroups.get(key).allotments.push(a);
    });

    const rows = [];
    let sno = 1;

    evalCourseGroups.forEach((grp) => {
      const totalScripts = grp.allotments.length;
      const evaluatedCount = grp.allotments.filter((a) => (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null).length;
      const pendingScripts = Math.max(0, totalScripts - evaluatedCount);
      const quota = Math.max(totalScripts, 30); // Standard quota minimum or assigned total

      rows.push({
        sno: sno++,
        evaluatorId: grp.evaluatorId,
        evaluatorName: grp.evaluatorName,
        institution: grp.institution,
        subjectCode: grp.subjectCode,
        subjectName: grp.subjectName,
        examCode: grp.examCode,
        noScriptsEvaluated: evaluatedCount,
        totalScripts,
        pendingScripts,
        evaluatorQuota: quota
      });
    });

    res.json({
      success: true,
      totalEvaluators: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. Day Report (Daily Evaluation Report)
exports.getDayReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);
    if (text(req.query.coursecode)) filter.coursecode = text(req.query.coursecode);
    if (text(req.query.examineremail)) filter.examineremail = text(req.query.examineremail);

    const [allotments, examiners] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamExaminer.find({ colid }).lean()
    ]);

    const examinerMap = new Map();
    examiners.forEach((e) => {
      const email = text(e.email || e.examineremail).toLowerCase();
      if (email) examinerMap.set(email, e);
    });

    const targetDateFilter = text(req.query.date);
    const dayGroups = new Map();

    allotments.forEach((a) => {
      const isEvaluated = (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null;
      if (!isEvaluated) return;

      let dateStr = "";
      if (a.evaluationdate) {
        dateStr = text(a.evaluationdate).slice(0, 10);
      } else if (a.updatedAt) {
        dateStr = new Date(a.updatedAt).toISOString().slice(0, 10);
      } else {
        dateStr = new Date().toISOString().slice(0, 10);
      }

      if (targetDateFilter && dateStr !== targetDateFilter) return;

      const evalEmail = text(a.examineremail).toLowerCase() || "unassigned";
      const key = `${dateStr}||${evalEmail}||${text(a.coursecode)}`;

      if (!dayGroups.has(key)) {
        const ex = examinerMap.get(evalEmail) || {};
        dayGroups.set(key, {
          date: dateStr,
          evaluatorId: text(a.evaluatorid || (evalEmail.includes("@") ? evalEmail.split("@")[0].toUpperCase() : "P1040")),
          evaluatorName: text(a.examinername || ex.name || "Examiner"),
          evaluatorEmail: evalEmail,
          institution: text(ex.institution || ex.collegename || "People's University, Bhopal"),
          subjectCode: a.coursecode,
          subjectName: a.course,
          examCode: a.examcode,
          examName: a.exam,
          allotments: []
        });
      }
      dayGroups.get(key).allotments.push(a);
    });

    const rows = [];
    let sno = 1;

    const sortedKeys = Array.from(dayGroups.keys()).sort((a, b) => b.localeCompare(a));
    sortedKeys.forEach((key) => {
      const grp = dayGroups.get(key);
      const marks = grp.allotments.map((a) => Number(a.totalmarksobtained) || 0);
      const avgMark = marks.length > 0 ? (marks.reduce((acc, m) => acc + m, 0) / marks.length).toFixed(1) : 0;
      const maxMark = marks.length > 0 ? Math.max(...marks) : 0;
      const minMark = marks.length > 0 ? Math.min(...marks) : 0;

      rows.push({
        sno: sno++,
        date: grp.date,
        evaluatorId: grp.evaluatorId,
        evaluatorName: grp.evaluatorName,
        institution: grp.institution,
        subjectCode: grp.subjectCode,
        subjectName: grp.subjectName,
        examCode: grp.examCode,
        examName: grp.examName,
        scriptsEvaluated: grp.allotments.length,
        avgMark,
        highestMark: maxMark,
        lowestMark: minMark,
        valuationType: "V1 Valuation"
      });
    });

    res.json({
      success: true,
      totalRows: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. Monthly Report (Valuator Valuations)
exports.getMonthlyValuationsReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);

    const [allotments, revaluations, examiners] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamReevaluation.find({ colid }).lean(),
      ConductExamExaminer.find({ colid }).lean()
    ]);

    const examinerMap = new Map();
    examiners.forEach((e) => {
      const email = text(e.email || e.examineremail).toLowerCase();
      if (email) examinerMap.set(email, e);
    });

    const targetMonthFilter = text(req.query.yearMonth);
    const monthGroups = new Map();

    allotments.forEach((a) => {
      const isEvaluated = (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null;
      let dateStr = a.evaluationdate ? text(a.evaluationdate) : (a.updatedAt ? new Date(a.updatedAt).toISOString() : new Date().toISOString());
      const ym = dateStr.slice(0, 7);

      if (targetMonthFilter && ym !== targetMonthFilter) return;

      const evalEmail = text(a.examineremail).toLowerCase() || "unassigned";
      const key = `${ym}||${evalEmail}`;

      if (!monthGroups.has(key)) {
        const ex = examinerMap.get(evalEmail) || {};
        const dateObj = new Date(ym + "-01");
        const monthLabel = isNaN(dateObj.getTime()) ? ym : dateObj.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

        monthGroups.set(key, {
          yearMonth: ym,
          monthName: monthLabel,
          evaluatorId: text(a.evaluatorid || (evalEmail.includes("@") ? evalEmail.split("@")[0].toUpperCase() : "P1040")),
          evaluatorName: text(a.examinername || ex.name || "Examiner"),
          evaluatorEmail: evalEmail,
          institution: text(ex.institution || ex.collegename || "People's University, Bhopal"),
          coursesSet: new Set(),
          allotments: [],
          activeDaysSet: new Set(),
          revalCount: 0
        });
      }

      const grp = monthGroups.get(key);
      grp.allotments.push(a);
      grp.coursesSet.add(a.coursecode);
      if (isEvaluated) {
        grp.activeDaysSet.add(dateStr.slice(0, 10));
      }
    });

    revaluations.forEach((r) => {
      const dateStr = r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString();
      const ym = dateStr.slice(0, 7);
      if (targetMonthFilter && ym !== targetMonthFilter) return;

      ["reevaluator1", "reevaluator2", "reevaluator3"].forEach((evalKey) => {
        const rev = r[evalKey];
        if (rev && rev.status === "Evaluated" && rev.examineremail) {
          const evalEmail = text(rev.examineremail).toLowerCase();
          const key = `${ym}||${evalEmail}`;
          if (monthGroups.has(key)) {
            monthGroups.get(key).revalCount++;
          }
        }
      });
    });

    const rows = [];
    let sno = 1;

    const sortedMonthKeys = Array.from(monthGroups.keys()).sort((a, b) => b.localeCompare(a));
    sortedMonthKeys.forEach((key) => {
      const grp = monthGroups.get(key);
      const totalAllotted = grp.allotments.length;
      const v1Done = grp.allotments.filter((a) => (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null).length;
      const totalDone = v1Done + grp.revalCount;
      const pending = Math.max(0, totalAllotted - v1Done);
      const rate = totalAllotted > 0 ? Math.round((v1Done / totalAllotted) * 100) : 100;

      rows.push({
        sno: sno++,
        month: grp.monthName,
        yearMonth: grp.yearMonth,
        evaluatorId: grp.evaluatorId,
        evaluatorName: grp.evaluatorName,
        institution: grp.institution,
        subjectsCount: grp.coursesSet.size,
        totalAllotted,
        v1Evaluated: v1Done,
        revalEvaluated: grp.revalCount,
        totalEvaluated: totalDone,
        pendingScripts: pending,
        activeDays: grp.activeDaysSet.size,
        completionRate: `${rate}%`
      });
    });

    res.json({
      success: true,
      totalRows: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 5. Examiners Report & Attendance
exports.getExaminersReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);

    const [allotments, examiners] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamExaminer.find({ colid }).lean()
    ]);

    const examinerMap = new Map();
    examiners.forEach((e) => {
      const email = text(e.email || e.examineremail).toLowerCase();
      if (email) examinerMap.set(email, e);
    });

    const evalGroups = new Map();

    allotments.forEach((a) => {
      const evalEmail = text(a.examineremail).toLowerCase() || "unassigned";
      if (!evalGroups.has(evalEmail)) {
        const ex = examinerMap.get(evalEmail) || {};
        evalGroups.set(evalEmail, {
          evaluatorId: text(a.evaluatorid || (evalEmail.includes("@") ? evalEmail.split("@")[0].toUpperCase() : "P1040")),
          evaluatorName: text(a.examinername || ex.name || "Examiner"),
          email: evalEmail,
          phone: text(ex.phone || ex.mobile || "9425093544"),
          institution: text(ex.institution || ex.collegename || "People's University, Bhopal"),
          courses: new Set(),
          allotments: [],
          activeDates: new Set()
        });
      }

      const grp = evalGroups.get(evalEmail);
      grp.allotments.push(a);
      grp.courses.add(a.course);

      const isEvaluated = (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null;
      if (isEvaluated) {
        const dateStr = a.evaluationdate ? text(a.evaluationdate).slice(0, 10) : (a.updatedAt ? new Date(a.updatedAt).toISOString().slice(0, 10) : "");
        if (dateStr) grp.activeDates.add(dateStr);
      }
    });

    const rows = [];
    let sno = 1;

    evalGroups.forEach((grp) => {
      const total = grp.allotments.length;
      const evaluated = grp.allotments.filter((a) => (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null);
      const evaluatedCount = evaluated.length;
      const pending = Math.max(0, total - evaluatedCount);

      const marks = evaluated.map((a) => Number(a.totalmarksobtained) || 0);
      const avgMark = marks.length > 0 ? (marks.reduce((acc, m) => acc + m, 0) / marks.length).toFixed(1) : "-";
      const highestMark = marks.length > 0 ? Math.max(...marks) : "-";
      const lowestMark = marks.length > 0 ? Math.min(...marks) : "-";

      const sortedDates = Array.from(grp.activeDates).sort();
      const lastActive = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : "-";
      const status = evaluatedCount >= total && total > 0 ? "Completed" : evaluatedCount > 0 ? "In Progress" : "Pending";

      rows.push({
        sno: sno++,
        evaluatorId: grp.evaluatorId,
        evaluatorName: grp.evaluatorName,
        email: grp.email,
        phone: grp.phone,
        institution: grp.institution,
        allottedCourses: Array.from(grp.courses).join(", "),
        totalScripts: total,
        evaluatedScripts: evaluatedCount,
        pendingScripts: pending,
        avgMark,
        highestMark,
        lowestMark,
        activeValuationDays: grp.activeDates.size,
        lastActiveDate: lastActive,
        status
      });
    });

    res.json({
      success: true,
      totalRows: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 6. Center-wise Valuation Report
exports.getCenterWiseReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);

    const [allotments, answerBooks, examiners] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamAnswerBook.find({ colid }).lean(),
      ConductExamExaminer.find({ colid }).lean()
    ]);

    const examinerMap = new Map();
    examiners.forEach((e) => {
      const email = text(e.email || e.examineremail).toLowerCase();
      if (email) examinerMap.set(email, e);
    });

    const bookRegnos = new Set(answerBooks.map((b) => text(b.regno)));
    const centerGroups = new Map();

    allotments.forEach((a) => {
      const centerName = text(a.program || a.department || "Main Campus - Center 1");
      if (!centerGroups.has(centerName)) {
        centerGroups.set(centerName, {
          centerName,
          coursesSet: new Set(),
          allotments: []
        });
      }
      centerGroups.get(centerName).coursesSet.add(a.coursecode);
      centerGroups.get(centerName).allotments.push(a);
    });

    const rows = [];
    let sno = 1;

    centerGroups.forEach((grp) => {
      const totalScripts = grp.allotments.length;
      const uploaded = grp.allotments.filter((a) => bookRegnos.has(text(a.regno))).length;
      const pendingUploads = Math.max(0, totalScripts - uploaded);
      const valuated = grp.allotments.filter((a) => (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null).length;
      const pendingValuation = Math.max(0, totalScripts - valuated);
      const percentCompleted = totalScripts > 0 ? Math.round((valuated / totalScripts) * 100) : 0;

      rows.push({
        sno: sno++,
        centerName: grp.centerName,
        totalSubjects: grp.coursesSet.size,
        totalScripts,
        uploadedScripts: uploaded,
        pendingUploads,
        valuatedScripts: valuated,
        pendingValuation,
        percentCompleted: `${percentCompleted}%`
      });
    });

    res.json({
      success: true,
      totalRows: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 7. Series-wise Script Log (CN Serial Log)
exports.getSeriesWiseLog = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);
    if (text(req.query.coursecode)) filter.coursecode = text(req.query.coursecode);

    const [allotments, answerBooks] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).sort({ regno: 1 }).lean(),
      ConductExamAnswerBook.find({ colid }).lean()
    ]);

    const bookMap = new Map();
    answerBooks.forEach((b) => bookMap.set(text(b.regno), b));

    const rows = allotments.map((a, idx) => {
      const b = bookMap.get(text(a.regno));
      const cn = text(a.cn || b?.cn || (631580 + idx + 1));
      const isDone = (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null;
      const marks = isDone && a.totalmarksobtained !== null ? a.totalmarksobtained : "-";
      const evalDate = a.evaluationdate ? text(a.evaluationdate).slice(0, 10) : (a.updatedAt && isDone ? new Date(a.updatedAt).toISOString().slice(0, 10) : "-");

      return {
        sno: idx + 1,
        cn,
        regno: a.regno,
        student: a.student,
        subjectCode: a.coursecode,
        subjectName: a.course,
        evaluatorId: text(a.evaluatorid || (a.examineremail ? a.examineremail.split("@")[0].toUpperCase() : "P1040")),
        evaluatorName: a.examinername || "Examiner",
        marks,
        valuationType: "V1 (Initial)",
        evaluationDate: evalDate,
        status: isDone ? "Valuated" : "Pending"
      };
    });

    res.json({
      success: true,
      totalRows: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 8. Skipped / Pending Answer Scripts Exception Report
exports.getSkippedScriptsReport = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);
    if (text(req.query.coursecode)) filter.coursecode = text(req.query.coursecode);

    const [allotments, answerBooks] = await Promise.all([
      ConductExamExaminerAllotment.find(filter).lean(),
      ConductExamAnswerBook.find({ colid }).lean()
    ]);

    const bookMap = new Map();
    answerBooks.forEach((b) => bookMap.set(text(b.regno), b));

    const rows = [];
    let sno = 1;

    allotments.forEach((a, idx) => {
      const b = bookMap.get(text(a.regno));
      const hasUpload = Boolean(b);
      const isEvaluated = (a.evaluationstatus || "").toLowerCase() === "evaluated" || a.totalmarksobtained !== null;

      if (!isEvaluated || !hasUpload) {
        let issueType = "";
        if (!hasUpload) {
          issueType = "Script Upload Missing";
        } else if (!isEvaluated) {
          issueType = "Awaiting Final Valuation (AFV)";
        }

        rows.push({
          sno: sno++,
          cn: text(a.cn || b?.cn || (631580 + idx + 1)),
          regno: a.regno,
          student: a.student,
          subjectCode: a.coursecode,
          subjectName: a.course,
          evaluatorId: text(a.evaluatorid || (a.examineremail ? a.examineremail.split("@")[0].toUpperCase() : "P1040")),
          evaluatorName: a.examinername || "Examiner",
          issueType,
          status: hasUpload ? "Upload OK - Not Valuated" : "Pending Upload"
        });
      }
    });

    res.json({
      success: true,
      totalRows: rows.length,
      rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
