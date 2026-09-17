const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamAnswerBook = require("../Models/conductexamanswerbook2ds");
const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");
const ConductExamOnScreenMark = require("../Models/conductexamonscreenmarkds");
const ConductExamQuestionPaper = require("../Models/conductexamquestionpaper2ds");
const ConductExamConfiguration = require("../Models/conductexamconfigurationds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");

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

    res.json({
      success: true,
      academicyears,
      exams,
      programs,
      courses
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

    const filter = { colid, examcode, coursecode };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);

    let allotments = await ConductExamExaminerAllotment.find(filter).sort({ regno: 1, student: 1 }).lean();
    if (!allotments.length) {
      allotments = await ConductExamExaminerAllotment.find({ colid, coursecode }).sort({ regno: 1, student: 1 }).lean();
    }

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

    const sampleAllot = allotments[0] || rolls[0] || {};

    const students = allotments.map((allot, index) => {
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
    if (sampleAllot.exam) {
      const match = sampleAllot.exam.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-_ ]?(\d{4})/i);
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
      reportTitle: "Award List - Theory Exam, " + examSession,
      date: dateFormatted,
      academicyear: sampleAllot.academicyear || "2026-27",
      yearText: sampleAllot.exam || (sampleAllot.program || "Course") + " (" + (sampleAllot.academicyear || "") + ")",
      program: sampleAllot.program || "PhD",
      programcode: sampleAllot.programcode || "PHD-002",
      paperName: sampleAllot.course || "Research Methodology",
      paperCode: sampleAllot.coursecode || "PHD-01",
      exam: sampleAllot.exam || "Ph.D Course Work_MAIN-JUNE-2026",
      examcode: sampleAllot.examcode || "ES-025",
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
