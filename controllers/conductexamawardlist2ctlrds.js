const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamAnswerBook = require("../Models/conductexamanswerbook2ds");
const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");
const ConductExamOnScreenMark = require("../Models/conductexamonscreenmarkds");
const ConductExamQuestionPaper = require("../Models/conductexamquestionpaper2ds");
const ConductExamConfiguration = require("../Models/conductexamconfigurationds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");
const ConductExamReevaluation = require("../Models/conductexamreevaluation2ds");

const text = (value) => String(value || "").trim();
const colNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values = []) => [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function numberToWords(num) {
  if (num === null || num === undefined || num === "") return "Zero";
  const n = Number(num);
  if (isNaN(n) || n === 0) return "Zero";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  const intPart = Math.floor(Math.abs(n));
  const decPart = Math.round((Math.abs(n) - intPart) * 10);

  function convertChunk(num) {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + ones[num % 10] : "");
    if (num < 1000) {
      return (
        ones[Math.floor(num / 100)] +
        " Hundred" +
        (num % 100 !== 0 ? " " + convertChunk(num % 100) : "")
      );
    }
    return String(num);
  }

  let words = convertChunk(intPart);
  if (!words) words = "Zero";
  if (decPart > 0) {
    words += " Point " + (ones[decPart] || String(decPart));
  }
  return words;
}

// 1. Get Dropdown Options for Award List Report
exports.getOptions = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    let allotments = await ConductExamExaminerAllotment.find({ colid }).sort({ academicyear: -1, exam: 1, course: 1 }).lean();
    if (!allotments.length) {
      allotments = await ConductExamRoll.find({ colid }).sort({ academicyear: -1, exam: 1, course: 1 }).lean();
    }

    const academicyears = uniq(allotments.map((r) => r.academicyear));
    const exams = uniq(allotments.map((r) => r.examcode + "||" + r.exam)).map((val) => {
      const [examcode, exam] = val.split("||");
      return { examcode, exam };
    });
    const programs = uniq(allotments.map((r) => r.programcode + "||" + r.program)).map((val) => {
      const [programcode, program] = val.split("||");
      return { programcode, program };
    });
    const courses = uniq(allotments.map((r) => r.coursecode + "||" + r.course + "||" + r.examcode + "||" + r.programcode)).map((val) => {
      const [coursecode, course, examcode, programcode] = val.split("||");
      return { coursecode, course, examcode, programcode };
    });

    const valuationtypes = [
      { valuationtype: "V1", label: "Initial Valuation (V1)" },
      { valuationtype: "V2", label: "Re-evaluation 1 (V2)" },
      { valuationtype: "V3", label: "Re-evaluation 2 (V3)" },
      { valuationtype: "V4", label: "Re-evaluation 3 (V4)" }
    ];

    res.json({
      success: true,
      academicyears,
      exams,
      programs,
      courses,
      valuationtypes
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Generate Award List Report
exports.getAwardList = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const examcode = text(req.query.examcode);
    const coursecode = text(req.query.coursecode);
    if (!examcode || !coursecode) {
      return res.status(400).json({ success: false, message: "examcode and coursecode are required" });
    }

    const valuationtype = text(req.query.valuationtype || "V1").toUpperCase();

    const filter = { colid, examcode, coursecode };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);

    const answerBooks = await ConductExamAnswerBook.find({ colid, coursecode }).lean();
    const bookMap = new Map();
    answerBooks.forEach((b) => {
      bookMap.set(b.regno, b);
    });

    const rolls = await ConductExamRoll.find({ colid, coursecode }).lean();
    const rollMap = new Map();
    rolls.forEach((r) => {
      rollMap.set(r.regno, r);
    });

    const qp = await ConductExamQuestionPaper.findOne({ colid, coursecode }).sort({ updatedAt: -1 }).lean();
    let maxMarks = Number(qp?.totalmarks) || 75;
    if (qp?.sections?.length) {
      const secSum = qp.sections.reduce((acc, s) => acc + (Number(s.marks) || Number(s.maxmarks) || 0), 0);
      if (secSum > 0) maxMarks = secSum;
    }

    let students = [];
    let sampleRecord = {};
    let valLabel = "Initial Valuation (V1)";

    if (valuationtype === "V2" || valuationtype === "V3" || valuationtype === "V4") {
      const revalFilter = { colid, examcode, coursecode };
      if (text(req.query.academicyear)) revalFilter.academicyear = text(req.query.academicyear);

      const revals = await ConductExamReevaluation.find(revalFilter).sort({ regno: 1, student: 1 }).lean();
      if (!revals.length) {
        return res.status(400).json({
          success: false,
          message: "No student applied for re-evaluation in this course."
        });
      }

      let evalKey = "reevaluator1";
      let evalRoleTitle = "Re-evaluator 1";
      if (valuationtype === "V2") {
        evalKey = "reevaluator1";
        evalRoleTitle = "Re-evaluator 1";
        valLabel = "Re-evaluation 1 (V2)";
      } else if (valuationtype === "V3") {
        evalKey = "reevaluator2";
        evalRoleTitle = "Re-evaluator 2";
        valLabel = "Re-evaluation 2 (V3)";
      } else if (valuationtype === "V4") {
        evalKey = "reevaluator3";
        evalRoleTitle = "Re-evaluator 3";
        valLabel = "Re-evaluation 3 (V4)";
      }

      const evaluatedRevals = revals.filter((r) => {
        const ev = r[evalKey];
        return ev && (ev.status === "Evaluated" || (ev.marks !== null && ev.marks !== undefined));
      });

      if (!evaluatedRevals.length) {
        return res.status(400).json({
          success: false,
          message: `${valLabel} marks have not been evaluated or submitted yet for this course.`
        });
      }

      sampleRecord = evaluatedRevals[0] || {};
      if (Number(sampleRecord.maxmarks)) maxMarks = Number(sampleRecord.maxmarks);

      students = evaluatedRevals.map((r, index) => {
        const ev = r[evalKey] || {};
        const book = bookMap.get(r.regno);
        const roll = rollMap.get(r.regno);
        const marksobtained = Number(ev.marks ?? 0);
        const cn = text(r.cn || book?.cn || roll?.cn || (631580 + index + 1));
        const rawEnroll = text(r.regno || "");
        const enrollmentPrefix = rawEnroll.length >= 2 ? rawEnroll.slice(0, 2) : rawEnroll;
        const enrollmentNumber = rawEnroll.length >= 2 ? rawEnroll.slice(2) : "";

        const evaluatorid = text(
          ev.evaluatorid ||
          (ev.email ? ev.email.split("@")[0].toUpperCase() : `${valuationtype}-EVAL`)
        );
        const evaluatorname = text(ev.name || evalRoleTitle);
        const evaluatorcontact = text(ev.contact || ev.mobile || "NA");
        const evaluatoremail = text(ev.email || "");

        return {
          sn: index + 1,
          cn,
          regno: r.regno,
          enrollmentPrefix,
          enrollmentNumber,
          student: r.student,
          originalMarks: r.originalmarks,
          inFigure: marksobtained,
          inWords: numberToWords(marksobtained),
          evaluatorid,
          evaluatorname,
          evaluatorcontact,
          evaluatoremail
        };
      });
    } else {
      // V1: Initial Valuation
      valLabel = "Initial Valuation (V1)";

      let allotments = await ConductExamExaminerAllotment.find(filter).sort({ regno: 1, student: 1 }).lean();
      if (!allotments.length) {
        allotments = await ConductExamExaminerAllotment.find({ colid, coursecode }).sort({ regno: 1, student: 1 }).lean();
      }

      const assessmentMarks = await NepLmsAssessmentMarks.find({ colid, coursecode }).lean();
      const assessMap = new Map();
      assessmentMarks.forEach((m) => {
        assessMap.set(m.regno, m);
      });

      const onScreenMarks = await ConductExamOnScreenMark.find({ colid, coursecode }).lean();
      const markGroup = new Map();
      onScreenMarks.forEach((m) => {
        if (!markGroup.has(m.regno)) markGroup.set(m.regno, []);
        markGroup.get(m.regno).push(m);
      });

      sampleRecord = allotments[0] || rolls[0] || {};

      students = allotments.map((allot, index) => {
        const book = bookMap.get(allot.regno);
        const roll = rollMap.get(allot.regno);
        const assess = assessMap.get(allot.regno);
        const marksList = markGroup.get(allot.regno) || [];

        let marksobtained = 0;
        if (allot.totalmarksobtained !== null && allot.totalmarksobtained !== undefined) {
          marksobtained = Number(allot.totalmarksobtained);
        } else if (assess?.marksobtained !== undefined && assess?.marksobtained !== null) {
          marksobtained = Number(assess.marksobtained);
        } else if (marksList.length > 0) {
          marksobtained = marksList.reduce((sum, item) => sum + (Number(item.marks) || 0), 0);
        }

        const cn = text(book?.cn || allot.cn || roll?.cn || (631580 + index + 1));
        const rawEnroll = text(allot.regno || "");
        const enrollmentPrefix = rawEnroll.length >= 2 ? rawEnroll.slice(0, 2) : rawEnroll;
        const enrollmentNumber = rawEnroll.length >= 2 ? rawEnroll.slice(2) : "";

        const evaluatorid = text(
          allot.evaluatorid ||
          allot.acceptancedata?.examinercode ||
          (allot.examineremail ? allot.examineremail.split("@")[0].toUpperCase() : "P1040")
        );
        const evaluatorname = text(
          allot.examinername ||
          allot.acceptancedata?.examinername ||
          "DR SATYENDRA PRASAD MUKHIYA"
        );
        const evaluatorcontact = text(
          allot.acceptancedata?.contact_no ||
          allot.acceptancedata?.working_mobile ||
          allot.acceptancedata?.working_phone ||
          "9425093544"
        );

        return {
          sn: index + 1,
          cn,
          regno: allot.regno,
          enrollmentPrefix,
          enrollmentNumber,
          student: allot.student,
          inFigure: marksobtained,
          inWords: numberToWords(marksobtained),
          evaluatorid,
          evaluatorname,
          evaluatorcontact,
          evaluatoremail: allot.examineremail || ""
        };
      });
    }

    let highestMark = 0;
    let lowestMark = 0;
    let highestEvaluator = null;
    let lowestEvaluator = null;

    if (students.length > 0) {
      let maxSt = students[0];
      let minSt = students[0];

      students.forEach((st) => {
        if (st.inFigure > maxSt.inFigure) maxSt = st;
        if (st.inFigure < minSt.inFigure) minSt = st;
      });

      highestMark = maxSt.inFigure;
      lowestMark = minSt.inFigure;

      highestEvaluator = {
        evaluatorid: maxSt.evaluatorid,
        name: maxSt.evaluatorname,
        contactno: maxSt.evaluatorcontact,
        email: maxSt.evaluatoremail
      };

      lowestEvaluator = {
        evaluatorid: minSt.evaluatorid,
        name: minSt.evaluatorname,
        contactno: minSt.evaluatorcontact,
        email: minSt.evaluatoremail
      };
    }

    const dateFormatted = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    let examSession = "";
    if (sampleRecord.exam) {
      const match = sampleRecord.exam.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-_ ]?(\d{4})/i);
      if (match) {
        examSession = match[1].toUpperCase() + match[2];
      }
    }
    if (!examSession) {
      examSession = new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" }).replace(" ", "").toUpperCase();
    }

    const examConfig = await ConductExamConfiguration.findOne({ colid }).lean();

    const meta = {
      institutionName: (examConfig?.institutionname || "PEOPLES UNIVERSITY, BHOPAL").toUpperCase(),
      affiliatedboard: examConfig?.affiliatedboard || "",
      address: examConfig?.address || "",
      phone: examConfig?.phone || "",
      email: examConfig?.email || "",
      website: examConfig?.website || "",
      logo: examConfig?.logo || "",
      reportTitle: `Award List - ${valLabel} - Theory Exam, ${examSession}`,
      valuationType: valuationtype,
      valuationLabel: valLabel,
      date: dateFormatted,
      academicyear: sampleRecord.academicyear || "2026-27",
      yearText: sampleRecord.exam || (sampleRecord.program || "Course") + " (" + (sampleRecord.academicyear || "") + ")",
      program: sampleRecord.program || "PhD",
      programcode: sampleRecord.programcode || "PHD-002",
      paperName: sampleRecord.course || "Research Methodology",
      paperCode: sampleRecord.coursecode || "PHD-01",
      exam: sampleRecord.exam || "Ph.D Course Work_MAIN-JUNE-2026",
      examcode: sampleRecord.examcode || "ES-025",
      maxMarks
    };

    res.json({
      success: true,
      meta,
      students,
      stats: {
        totalStudents: students.length,
        highestMark,
        lowestMark,
        highestEvaluator,
        lowestEvaluator
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
