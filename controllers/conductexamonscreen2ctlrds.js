const mongoose = require("mongoose");
const ConductExamQuestionPaper = require("../Models/conductexamquestionpaper2ds");
const ConductExamScoreRule = require("../Models/conductexamscorerule2ds");
const ConductExamOnScreenMark = require("../Models/conductexamonscreenmark2ds");
const ConductExamExaminer = require("../Models/conductexamexaminer2ds");
const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");
const ConductExamAnswerBook = require("../Models/conductexamanswerbook2ds");
const CourseAssessment = require("../Models/courseassessmentds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");
const ConductExamReevaluation = require("../Models/conductexamreevaluation2ds");

// Ensure legacy index without valuationtype is removed from MongoDB
ConductExamOnScreenMark.collection.dropIndex("colid_1_paperid_1_regno_1_questionid_1").catch(() => {});

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const colNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values = []) => [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = colNumber(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const basePaperFields = ["academicyear", "exam", "examcode", "regulation", "program", "programcode", "course", "coursecode"];

const rulePayload = (body = {}) => ({
  colid: colNumber(body.colid),
  academicyear: text(body.academicyear),
  exam: text(body.exam),
  examcode: text(body.examcode),
  regulation: text(body.regulation),
  program: text(body.program),
  programcode: text(body.programcode),
  course: text(body.course),
  coursecode: text(body.coursecode),
  paperid: text(body.paperid),
  sectionid: text(body.sectionid),
  section: text(body.section),
  questionsconsider: number(body.questionsconsider) || 1,
  status: text(body.status) || "Active",
  user: text(body.user)
});

const validateRule = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of [...basePaperFields, "paperid", "sectionid", "section"]) {
    if (!item[field]) return `${field} is required`;
  }
  if (item.questionsconsider <= 0) return "Questions to consider must be greater than zero";
  return "";
};

const resolvePaper = async (paperid, colid) => {
  let paper = null;
  if (mongoose.isValidObjectId(paperid)) {
    paper = await ConductExamQuestionPaper.findOne({ _id: paperid, colid }).lean();
    if (!paper) {
      const ConductExamQuestionPaperV1 = require("../Models/conductexamquestionpaperds");
      paper = await ConductExamQuestionPaperV1.findOne({ _id: paperid, colid }).lean();
    }
  }
  if (!paper && paperid) {
    paper = await ConductExamQuestionPaper.findOne({ coursecode: paperid, colid }).lean();
  }
  if (!paper && paperid) {
    const ConductExamQuestionPaperV1 = require("../Models/conductexamquestionpaperds");
    paper = await ConductExamQuestionPaperV1.findOne({ coursecode: paperid, colid }).lean();
  }
  if (!paper && mongoose.isValidObjectId(paperid)) {
    const allot = await ConductExamExaminerAllotment.findOne({ _id: paperid, colid }).lean();
    if (allot) {
      paper = {
        _id: allot._id,
        colid,
        academicyear: allot.academicyear,
        exam: allot.exam,
        examcode: allot.examcode,
        regulation: allot.regulation,
        program: allot.program,
        programcode: allot.programcode,
        type: allot.type,
        subject: allot.subject,
        semester: allot.semester,
        course: allot.course,
        coursecode: allot.coursecode,
        status: "InvigilatorSubmitted",
        sections: [
          {
            _id: allot._id,
            title: "General Evaluation",
            questions: [
              {
                _id: allot._id,
                question: "Question 1 / Script Evaluation",
                marks: 100
              }
            ]
          }
        ]
      };
    }
  }
  if (!paper && paperid) {
    const allot = await ConductExamExaminerAllotment.findOne({ coursecode: paperid, colid }).lean();
    if (allot) {
      paper = {
        _id: allot._id,
        colid,
        academicyear: allot.academicyear,
        exam: allot.exam,
        examcode: allot.examcode,
        regulation: allot.regulation,
        program: allot.program,
        programcode: allot.programcode,
        type: allot.type,
        subject: allot.subject,
        semester: allot.semester,
        course: allot.course,
        coursecode: allot.coursecode,
        status: "InvigilatorSubmitted",
        sections: [
          {
            _id: allot._id,
            title: "General Evaluation",
            questions: [
              {
                _id: allot._id,
                question: "Question 1 / Script Evaluation",
                marks: 100
              }
            ]
          }
        ]
      };
    }
  }
  return paper;
};

exports.options = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const filter = buildFilter(req.query, basePaperFields);
    let papers = await ConductExamQuestionPaper.find({ ...filter, status: { $nin: [/^Draft$/i, /^Rejected$/i] } })
      .sort({ academicyear: -1, exam: 1, program: 1, course: 1 })
      .lean();
    if (!papers.length) {
      const ConductExamQuestionPaperV1 = require("../Models/conductexamquestionpaperds");
      papers = await ConductExamQuestionPaperV1.find({ ...filter, status: { $nin: [/^Draft$/i, /^Rejected$/i] } })
        .sort({ academicyear: -1, exam: 1, program: 1, course: 1 })
        .lean();
    }
    res.json({
      success: true,
      papers,
      academicyears: uniq(papers.map((row) => row.academicyear)),
      exams: uniq(papers.map((row) => `${row.examcode}||${row.exam}`)).map((value) => {
        const [examcode, exam] = value.split("||");
        return { examcode, exam };
      }),
      regulations: uniq(papers.map((row) => row.regulation)),
      programs: uniq(papers.map((row) => `${row.programcode}||${row.program}`)).map((value) => {
        const [programcode, program] = value.split("||");
        return { programcode, program };
      }),
      courses: uniq(papers.map((row) => `${row.coursecode}||${row.course}`)).map((value) => {
        const [coursecode, course] = value.split("||");
        return { coursecode, course };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRules = async (req, res) => {
  try {
    const filter = buildFilter(req.query, [...basePaperFields, "paperid", "sectionid", "status"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamScoreRule.find(filter).sort({ academicyear: -1, exam: 1, course: 1, section: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveRule = async (req, res) => {
  try {
    const item = rulePayload(req.body);
    const error = validateRule(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ConductExamScoreRule.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ConductExamScoreRule.findOneAndUpdate({ colid: item.colid, paperid: item.paperid, sectionid: item.sectionid }, item, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.code === 11000 ? "Rule already exists for this section" : error.message });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const result = await ConductExamScoreRule.deleteOne({ _id: req.body.id, colid: colNumber(req.body.colid) });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.assignedCourses = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!examineremail) return res.status(400).json({ success: false, message: "examineremail is required" });

    // 1. Fetch allotments for this examiner in V2
    let allotments = await ConductExamExaminerAllotment.find({
      colid,
      examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i")
    }).sort({ academicyear: -1, exam: 1, course: 1, createdAt: -1 }).lean();

    // 2. Fallback to V1 if none in V2
    if (!allotments.length) {
      const ConductExamExaminerAllotmentV1 = require("../Models/conductexamexaminerallotmentds");
      allotments = await ConductExamExaminerAllotmentV1.find({
        colid,
        examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i")
      }).sort({ academicyear: -1, exam: 1, course: 1, createdAt: -1 }).lean();
    }

    // 3. Fallback for administrator / AR Evaluation: if still none, fetch all allotments for the college
    if (!allotments.length) {
      allotments = await ConductExamExaminerAllotment.find({ colid })
        .sort({ academicyear: -1, exam: 1, course: 1, createdAt: -1 }).lean();
      if (!allotments.length) {
        const ConductExamExaminerAllotmentV1 = require("../Models/conductexamexaminerallotmentds");
        allotments = await ConductExamExaminerAllotmentV1.find({ colid })
          .sort({ academicyear: -1, exam: 1, course: 1, createdAt: -1 }).lean();
      }
    }

    // Group allotments by Course: { academicyear, examcode, coursecode }
    const courseMap = new Map();
    const now = new Date();

    allotments.forEach((row) => {
      const key = `${row.academicyear}__${row.examcode}__${row.coursecode}`;
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          key,
          academicyear: row.academicyear,
          exam: row.exam,
          examcode: row.examcode,
          regulation: row.regulation,
          program: row.program,
          programcode: row.programcode,
          type: row.type,
          subject: row.subject,
          semester: row.semester,
          course: row.course,
          coursecode: row.coursecode,
          startdate: row.startdate || "",
          enddate: row.enddate || "",
          earliestCreatedAt: row.createdAt ? new Date(row.createdAt) : null,
          latestCreatedAt: row.createdAt ? new Date(row.createdAt) : null,
          totalScripts: 0,
          evaluatedScripts: 0,
          allotmentIds: []
        });
      }
      const item = courseMap.get(key);
      item.totalScripts += 1;
      if (String(row.evaluationstatus || "").toLowerCase() === "evaluated") {
        item.evaluatedScripts += 1;
      }
      item.allotmentIds.push(row._id);
      if (row.createdAt) {
        const d = new Date(row.createdAt);
        if (!item.earliestCreatedAt || d < item.earliestCreatedAt) item.earliestCreatedAt = d;
        if (!item.latestCreatedAt || d > item.latestCreatedAt) item.latestCreatedAt = d;
      }
      if (row.enddate && !item.enddate) item.enddate = row.enddate;
      if (row.startdate && !item.startdate) item.startdate = row.startdate;
    });

    const coursesList = Array.from(courseMap.values());

    // Resolve Question Paper for each course
    const enriched = await Promise.all(coursesList.map(async (item) => {
      let qp = await ConductExamQuestionPaper.findOne({
        colid,
        coursecode: item.coursecode,
        status: { $nin: [/^Draft$/i, /^Rejected$/i] }
      }).lean();

      if (!qp) {
        const ConductExamQuestionPaperV1 = require("../Models/conductexamquestionpaperds");
        qp = await ConductExamQuestionPaperV1.findOne({
          colid,
          coursecode: item.coursecode,
          status: { $nin: [/^Draft$/i, /^Rejected$/i] }
        }).lean();
      }

      // Check if newly assigned: within 2 days (48 hours)
      let isNew = false;
      const refDate = item.latestCreatedAt || (item.startdate ? new Date(item.startdate) : null);
      if (refDate && !Number.isNaN(refDate.getTime())) {
        const diffHours = (now.getTime() - refDate.getTime()) / (1000 * 60 * 60);
        if (diffHours >= -24 && diffHours <= 48) {
          isNew = true;
        }
      }

      // Compute days remaining based on enddate
      let daysRemaining = null;
      let daysRemainingText = "Not Set";
      let isOverdue = false;
      if (item.enddate) {
        const endD = new Date(item.enddate);
        if (!Number.isNaN(endD.getTime())) {
          endD.setHours(23, 59, 59, 999);
          const diffDays = Math.ceil((endD.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          daysRemaining = diffDays;
          if (diffDays < 0) {
            daysRemainingText = `Overdue (${Math.abs(diffDays)}d)`;
            isOverdue = true;
          } else if (diffDays === 0) {
            daysRemainingText = "Due Today";
          } else {
            daysRemainingText = `${diffDays} Day${diffDays > 1 ? "s" : ""} Left`;
          }
        }
      }

      const balance = Math.max(0, item.totalScripts - item.evaluatedScripts);

      return {
        ...item,
        paperid: qp?._id || item.allotmentIds[0],
        hasDigitalQP: Boolean(qp),
        sectionsCount: qp?.sections?.length || 1,
        isNew,
        daysRemaining,
        daysRemainingText,
        isOverdue,
        balance
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reevaluationAssignedCourses = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!examineremail) return res.status(400).json({ success: false, message: "examineremail is required" });

    const userTarget = examineremail.toLowerCase().trim();
    const userPrefix = userTarget.includes("@") ? userTarget.split("@")[0] : userTarget;

    const regexEmail = new RegExp(`^${escapeRegex(userTarget)}$`, "i");
    const regexUser = new RegExp(`^${escapeRegex(userPrefix)}(@.*)?$`, "i");

    // Filter strictly by the logged-in evaluator's email or evaluator ID
    const filter = {
      colid,
      $or: [
        { "reevaluator1.email": { $in: [regexEmail, regexUser] } },
        { "reevaluator1.evaluatorid": { $in: [regexEmail, regexUser] } },
        { "reevaluator2.email": { $in: [regexEmail, regexUser] } },
        { "reevaluator2.evaluatorid": { $in: [regexEmail, regexUser] } },
        { "reevaluator3.email": { $in: [regexEmail, regexUser] } },
        { "reevaluator3.evaluatorid": { $in: [regexEmail, regexUser] } }
      ]
    };

    const revals = await ConductExamReevaluation.find(filter)
      .sort({ academicyear: -1, exam: 1, course: 1, updatedAt: -1 })
      .lean();

    const checkEvaluatorMatch = (evalObj) => {
      if (!evalObj) return false;
      const evalEmail = String(evalObj.email || "").trim().toLowerCase();
      const evalId = String(evalObj.evaluatorid || "").trim().toLowerCase();
      if (!evalEmail && !evalId) return false;

      const evalUserPart = evalEmail.includes("@") ? evalEmail.split("@")[0] : evalEmail;

      if (evalEmail && evalEmail === userTarget) return true;
      if (evalId && evalId === userTarget) return true;
      if (evalUserPart && evalUserPart === userPrefix) return true;
      if (evalId && evalId === userPrefix) return true;

      return false;
    };

    const courseMap = new Map();

    revals.forEach((row) => {
      const roles = [];
      const e1Match = checkEvaluatorMatch(row.reevaluator1);
      const e2Match = checkEvaluatorMatch(row.reevaluator2);
      const e3Match = checkEvaluatorMatch(row.reevaluator3);

      if (e1Match) {
        roles.push({
          valuationtype: "V2",
          roleLabel: "Re-evaluator 1 (V2)",
          evalObj: row.reevaluator1
        });
      }
      if (e2Match) {
        roles.push({
          valuationtype: "V3",
          roleLabel: "Re-evaluator 2 (V3)",
          evalObj: row.reevaluator2
        });
      }
      if (e3Match) {
        roles.push({
          valuationtype: "V4",
          roleLabel: "Re-evaluator 3 (V4)",
          evalObj: row.reevaluator3
        });
      }

      roles.forEach((roleInfo) => {
        const key = `${row.academicyear}__${row.examcode}__${row.coursecode}__${roleInfo.valuationtype}`;
        if (!courseMap.has(key)) {
          courseMap.set(key, {
            key,
            academicyear: row.academicyear,
            exam: row.exam,
            examcode: row.examcode,
            regulation: row.regulation,
            program: row.program,
            programcode: row.programcode,
            subject: row.subject,
            course: row.course,
            coursecode: row.coursecode,
            valuationtype: roleInfo.valuationtype,
            roleLabel: roleInfo.roleLabel,
            totalScripts: 0,
            evaluatedScripts: 0,
            pendingScripts: 0,
            students: []
          });
        }
        const item = courseMap.get(key);
        item.totalScripts += 1;
        const isEval = String(roleInfo.evalObj?.status || "").toLowerCase() === "evaluated";
        if (isEval) {
          item.evaluatedScripts += 1;
        } else {
          item.pendingScripts += 1;
        }
        item.students.push({
          _id: row._id,
          regno: row.regno,
          student: row.student,
          cn: row.cn || "",
          marks: roleInfo.evalObj?.marks,
          status: roleInfo.evalObj?.status || "Pending"
        });
      });
    });

    const coursesList = Array.from(courseMap.values());

    const enriched = await Promise.all(
      coursesList.map(async (item) => {
        let qp = await ConductExamQuestionPaper.findOne({
          colid,
          coursecode: item.coursecode,
          status: { $nin: [/^Draft$/i, /^Rejected$/i] }
        }).lean();

        if (!qp) {
          const ConductExamQuestionPaperV1 = require("../Models/conductexamquestionpaperds");
          qp = await ConductExamQuestionPaperV1.findOne({
            colid,
            coursecode: item.coursecode,
            status: { $nin: [/^Draft$/i, /^Rejected$/i] }
          }).lean();
        }

        const balance = Math.max(0, item.totalScripts - item.evaluatedScripts);

        return {
          ...item,
          paperid: qp?._id || item.coursecode,
          hasDigitalQP: Boolean(qp),
          sectionsCount: qp?.sections?.length || 1,
          balance,
          isReevaluation: true,
          daysRemainingText: "Open",
          daysRemaining: null,
          isOverdue: false
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markingOptions = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!examineremail) return res.status(400).json({ success: false, message: "examineremail is required" });

    // 1. Fetch allotments for this examiner in V2
    let allotments = await ConductExamExaminerAllotment.find({
      colid,
      examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i")
    }).sort({ academicyear: -1, exam: 1, course: 1 }).lean();

    // 2. Fallback to V1 allotments if none found in V2
    if (!allotments.length) {
      const ConductExamExaminerAllotmentV1 = require("../Models/conductexamexaminerallotmentds");
      allotments = await ConductExamExaminerAllotmentV1.find({
        colid,
        examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i")
      }).sort({ academicyear: -1, exam: 1, course: 1 }).lean();
    }

    // 3. Fallback for administrative/AR Evaluation roles
    if (!allotments.length) {
      allotments = await ConductExamExaminerAllotment.find({ colid })
        .sort({ academicyear: -1, exam: 1, course: 1 }).lean();
      if (!allotments.length) {
        const ConductExamExaminerAllotmentV1 = require("../Models/conductexamexaminerallotmentds");
        allotments = await ConductExamExaminerAllotmentV1.find({ colid })
          .sort({ academicyear: -1, exam: 1, course: 1 }).lean();
      }
    }

    if (!allotments.length) {
      return res.json({ success: true, papers: [], academicyears: [] });
    }

    // Group unique courses from allotments
    const courseKeys = new Set();
    const uniqueAllotments = [];
    allotments.forEach((row) => {
      const key = `${row.academicyear}__${row.examcode}__${row.coursecode}`;
      if (!courseKeys.has(key)) {
        courseKeys.add(key);
        uniqueAllotments.push(row);
      }
    });

    // Query question papers without rejecting 'InvigilatorSubmitted', 'Conducted', etc.
    const paperFilter = {
      colid,
      status: { $nin: [/^Draft$/i, /^Rejected$/i] },
      $or: uniqueAllotments.map((row) => ({
        academicyear: row.academicyear,
        examcode: row.examcode,
        coursecode: row.coursecode
      }))
    };

    let papers = await ConductExamQuestionPaper.find(paperFilter).sort({ academicyear: -1, exam: 1, course: 1 }).lean();

    // Check V1 for any missing courses
    const foundKeys = new Set(papers.map((p) => `${p.academicyear}__${p.examcode}__${p.coursecode}`));
    const missingAllotments = uniqueAllotments.filter((r) => !foundKeys.has(`${r.academicyear}__${r.examcode}__${r.coursecode}`));

    if (missingAllotments.length) {
      const ConductExamQuestionPaperV1 = require("../Models/conductexamquestionpaperds");
      const v1Papers = await ConductExamQuestionPaperV1.find({
        colid,
        status: { $nin: [/^Draft$/i, /^Rejected$/i] },
        $or: missingAllotments.map((row) => ({
          academicyear: row.academicyear,
          examcode: row.examcode,
          coursecode: row.coursecode
        }))
      }).lean();

      v1Papers.forEach((p) => {
        papers.push(p);
        foundKeys.add(`${p.academicyear}__${p.examcode}__${p.coursecode}`);
      });
    }

    // For any course without a digital question paper, synthesize one so scripts can still be marked
    uniqueAllotments.forEach((allot) => {
      const key = `${allot.academicyear}__${allot.examcode}__${allot.coursecode}`;
      if (!foundKeys.has(key)) {
        papers.push({
          _id: allot._id,
          colid,
          academicyear: allot.academicyear,
          exam: allot.exam,
          examcode: allot.examcode,
          regulation: allot.regulation,
          program: allot.program,
          programcode: allot.programcode,
          type: allot.type,
          subject: allot.subject,
          semester: allot.semester,
          course: allot.course,
          coursecode: allot.coursecode,
          status: "InvigilatorSubmitted",
          sections: [
            {
              _id: allot._id,
              title: "General Evaluation",
              questions: [
                {
                  _id: allot._id,
                  question: "Question 1 / Script Evaluation",
                  marks: 100
                }
              ]
            }
          ]
        });
        foundKeys.add(key);
      }
    });

    res.json({ success: true, papers, academicyears: uniq(papers.map((row) => row.academicyear)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.loadStudents = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    const paperid = text(req.query.paperid);
    if (colid === undefined || !examineremail || !paperid) return res.status(400).json({ success: false, message: "colid, examineremail and paper are required" });

    const paper = await resolvePaper(paperid, colid);
    if (!paper) return res.status(404).json({ success: false, message: "Paper not found" });

    const valuationtype = text(req.query.valuationtype) || "V1";
    let students = [];

    if (valuationtype !== "V1") {
      let revalFilter = {
        colid,
        coursecode: paper.coursecode
      };
      if (paper.examcode) revalFilter.examcode = paper.examcode;
      if (req.query.regno) revalFilter.regno = text(req.query.regno);

      const revals = await ConductExamReevaluation.find(revalFilter).sort({ regno: 1 }).lean();
      students = revals.map((r) => {
        let evalObj = valuationtype === "V2" ? r.reevaluator1 : (valuationtype === "V3" ? r.reevaluator2 : r.reevaluator3);
        return {
          _id: r._id,
          regno: r.regno,
          student: r.student,
          cn: r.cn || "",
          academicyear: r.academicyear,
          exam: r.exam,
          examcode: r.examcode,
          course: r.course,
          coursecode: r.coursecode,
          evaluationstatus: evalObj?.status || "Pending",
          totalmarksobtained: evalObj?.marks !== null && evalObj?.marks !== undefined ? evalObj.marks : null,
          valuationtype,
          examineremail: evalObj?.email || examineremail,
          examinername: evalObj?.name || "",
          verifiedpages: [],
          pagestamps: []
        };
      });
    } else {
      let studentFilter = {
        colid,
        academicyear: paper.academicyear,
        examcode: paper.examcode,
        coursecode: paper.coursecode
      };

      students = await ConductExamExaminerAllotment.find({
        ...studentFilter,
        examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i")
      }).sort({ regno: 1, student: 1 }).lean();

      // Fallback if no students for this specific examiner: check all allotments for this paper
      if (!students.length) {
        students = await ConductExamExaminerAllotment.find(studentFilter).sort({ regno: 1, student: 1 }).lean();
      }

      // Fallback: check V1 allotments if still empty
      if (!students.length) {
        const ConductExamExaminerAllotmentV1 = require("../Models/conductexamexaminerallotmentds");
        students = await ConductExamExaminerAllotmentV1.find(studentFilter).sort({ regno: 1, student: 1 }).lean();
      }
    }

    const regnos = students.map((s) => s.regno);
    const answerBooks = await ConductExamAnswerBook.find({
      colid,
      coursecode: paper.coursecode,
      regno: { $in: regnos }
    }).lean();
    const bookMap = new Map(answerBooks.map((b) => [b.regno, b]));

    const enrichedStudents = students.map((st) => {
      const book = bookMap.get(st.regno);
      const pCount = Number(book?.pagescount) || Number(st.pagescount) || 0;
      return {
        ...st,
        answerbookurl: book?.answerbookurl || st.answerbookurl || "",
        answerbookfilename: book?.answerbookfilename || st.answerbookfilename || "",
        pagescount: pCount > 0 ? pCount : 2,
        verifiedpages: Array.isArray(st.verifiedpages) ? st.verifiedpages : [],
        pagestamps: Array.isArray(st.pagestamps) ? st.pagestamps : []
      };
    });

    const examinerRecord = await ConductExamExaminer.findOne({
      colid,
      examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i"),
      coursecode: paper.coursecode
    }).lean() || await ConductExamExaminerAllotment.findOne({
      colid,
      examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i"),
      coursecode: paper.coursecode
    }).lean() || {
      examinername: "AR Evaluation",
      examineremail,
      acceptancestatus: "Accepted",
      declarationstatus: "Accepted"
    };

    // Flatten question details with patterns, labels, answers (solution)
    const flatQuestions = [];
    (paper.sections || []).forEach((sec, secIdx) => {
      (sec.questions || []).forEach((q, qIdx) => {
        let label = q.patternsubquestion || q.patternquestion || "";
        if (!label) {
          if (sec.questions.length > 1) {
            const letter = String.fromCharCode(97 + qIdx);
            label = `${secIdx + 1}${letter}`;
          } else {
            label = `Q${secIdx + 1}`;
          }
        }

        flatQuestions.push({
          sectionid: String(sec._id),
          section: sec.title || `Section ${secIdx + 1}`,
          questionid: String(q._id),
          questionlabel: label,
          question: q.question || `Question ${qIdx + 1}`,
          questionhtml: q.questionhtml || "",
          questiontype: q.questiontype || "Short Answer Type",
          isMCQ: /mcq|multiple choice/i.test(q.questiontype || ""),
          maxmarks: Number(q.marks || 0) || Number(q.maxmarks || 0) || 10,
          answer: q.answer || "",
          mathematicalexpression: q.mathematicalexpression || "",
          imageurl: q.imageurl || ""
        });
      });
    });

    // Ensure paper sections have question marks populated
    const enrichedPaper = {
      ...paper,
      sections: (paper.sections || []).map((sec, secIdx) => {
        const questions = (sec.questions || []).map((q, qIdx) => {
          const qMarks = Number(q.marks || 0) || Number(q.maxmarks || 0) || 10;
          return {
            ...q,
            marks: qMarks,
            maxmarks: qMarks
          };
        });
        const secMarks = Number(sec.marks) > 0 ? Number(sec.marks) : questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
        return {
          ...sec,
          marks: secMarks,
          questions
        };
      })
    };

    res.json({
      success: true,
      paper: enrichedPaper,
      flatQuestions,
      students: enrichedStudents,
      examiner: examinerRecord
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.loadStudentMarks = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    const paperid = text(req.query.paperid);
    const regno = text(req.query.regno);
    if (colid === undefined || !paperid || !regno) return res.status(400).json({ success: false, message: "colid, paper and regno are required" });

    const paper = await resolvePaper(paperid, colid);
    if (!paper) return res.status(404).json({ success: false, message: "Paper not found" });

    const valuationtype = text(req.query.valuationtype) || "V1";
    const isReval = valuationtype !== "V1";

    let [rules, marks, answerBook, allot] = await Promise.all([
      ConductExamScoreRule.find({ colid, paperid, status: /^Active$/i }).lean(),
      ConductExamOnScreenMark.find({ colid, paperid, regno, valuationtype }).lean(),
      ConductExamAnswerBook.findOne({ colid, coursecode: paper.coursecode, regno }).sort({ updatedAt: -1 }).lean()
        || ConductExamAnswerBook.findOne({ colid, regno }).sort({ updatedAt: -1 }).lean(),
      ConductExamExaminerAllotment.findOne({ colid, coursecode: paper.coursecode, regno }).lean()
    ]);

    // If no score rules configured yet, provide automatic default rules matching the paper sections
    if (!rules.length && paper?.sections?.length) {
      rules = paper.sections.map((sec) => ({
        sectionid: String(sec._id),
        section: sec.title || "Section",
        questionsconsider: sec.questions?.length || 1,
        status: "Active"
      }));
    }

    const markMap = new Map(marks.map((row) => [row.questionid, row]));
    res.json({
      success: true,
      paper,
      rules,
      valuationtype,
      isBlindMarking: isReval,
      marks: markMap.size ? Object.fromEntries(markMap.entries()) : {},
      answerbook: answerBook || null,
      verifiedpages: isReval ? [] : (allot?.verifiedpages || []),
      pagestamps: isReval ? [] : (allot?.pagestamps || [])
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveQuestionMarks = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const paperid = text(req.body.paperid);
    const student = req.body.student || {};
    const marks = Array.isArray(req.body.marks) ? req.body.marks : [];
    if (colid === undefined || !paperid || !text(student.regno)) return res.status(400).json({ success: false, message: "colid, paper and student are required" });

    const paper = await resolvePaper(paperid, colid);
    if (!paper) return res.status(404).json({ success: false, message: "Paper not found" });

    const ops = [];
    marks.forEach((row) => {
      const marksValue = number(row.marks);
      const maxmarks = number(row.maxmarks);
      if (marksValue < 0 || marksValue > maxmarks) return;
      const payload = {
        colid,
        academicyear: paper.academicyear,
        exam: paper.exam,
        examcode: paper.examcode,
        regulation: paper.regulation,
        program: paper.program,
        programcode: paper.programcode,
        type: paper.type,
        subject: paper.subject,
        semester: paper.semester,
        course: paper.course,
        coursecode: paper.coursecode,
        paperid,
        sectionid: text(row.sectionid),
        section: text(row.section),
        questionid: text(row.questionid),
        question: text(row.question),
        questionlabel: text(row.questionlabel),
        maxmarks,
        marks: marksValue,
        mcq: text(row.mcq),
        comment: text(row.comment),
        student: text(student.student),
        regno: text(student.regno),
        email: text(student.email),
        seatno: text(student.seatno),
        examinername: text(student.examinername),
        examineremail: text(student.examineremail),
        valuationtype: text(req.body.valuationtype || student.valuationtype || "V1"),
        user: text(req.body.user)
      };
      ops.push({
        updateOne: {
          filter: { colid, paperid, questionid: payload.questionid, regno: payload.regno, valuationtype: payload.valuationtype || "V1" },
          update: { $set: payload },
          upsert: true
        }
      });
    });

    let saved = 0;
    if (ops.length) {
      const result = await ConductExamOnScreenMark.bulkWrite(ops, { ordered: false });
      saved = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }

    const valType = text(req.body.valuationtype || student.valuationtype || "V1");
    if (valType === "V1" && (req.body.verifiedpages || req.body.pagestamps)) {
      await ConductExamExaminerAllotment.updateOne(
        { colid, coursecode: paper.coursecode, regno: text(student.regno) },
        {
          $set: {
            verifiedpages: Array.isArray(req.body.verifiedpages) ? req.body.verifiedpages : [],
            pagestamps: Array.isArray(req.body.pagestamps) ? req.body.pagestamps : []
          }
        }
      );
    }

    res.json({ success: true, saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.finalizeStudent = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const paperid = text(req.body.paperid);
    const student = req.body.student || {};
    if (colid === undefined || !paperid || !text(student.regno)) return res.status(400).json({ success: false, message: "colid, paper and student are required" });

    const valuationtype = text(req.body.valuationtype || student.valuationtype || "V1");

    const [paper, marks, assessment] = await Promise.all([
      resolvePaper(paperid, colid),
      ConductExamOnScreenMark.find({ colid, paperid, regno: text(student.regno), valuationtype }).lean(),
      CourseAssessment.findOne({
        colid,
        scoretype: /^External$/i,
        academicyear: text(req.body.academicyear),
        regulation: text(req.body.regulation),
        programcode: text(req.body.programcode),
        coursecode: text(req.body.coursecode)
      }).sort({ _id: 1 }).lean()
    ]);
    if (!paper) return res.status(404).json({ success: false, message: "Paper not found" });

    let rules = await ConductExamScoreRule.find({ colid, paperid, status: /^Active$/i }).lean();
    if (!rules.length && paper?.sections?.length) {
      rules = paper.sections.map((sec) => ({
        sectionid: String(sec._id),
        section: sec.title || "Section",
        questionsconsider: sec.questions?.length || 1
      }));
    }

    const sectionTotals = rules.map((rule) => {
      const sectionMarks = marks.filter((row) => row.sectionid === rule.sectionid).sort((a, b) => Number(b.marks || 0) - Number(a.marks || 0));
      const considered = sectionMarks.slice(0, Number(rule.questionsconsider || 1));
      return { section: rule.section, total: considered.reduce((sum, row) => sum + Number(row.marks || 0), 0), considered: considered.length };
    });
    const total = Number(sectionTotals.reduce((sum, row) => sum + row.total, 0).toFixed(2));

    const finalAssessment = assessment || {
      assessmentcomponent: "End Semester Exam",
      assessmentgroup: "SEE",
      grouptype: "Theory",
      weightage: 1,
      marks: 100
    };

    const weightage = number(finalAssessment.weightage) || 1;
    const payload = {
      academicyear: paper.academicyear,
      regulation: paper.regulation,
      program: paper.program,
      programcode: paper.programcode,
      type: paper.type || finalAssessment.type || "",
      subject: paper.subject || finalAssessment.subject || "",
      semester: paper.semester || finalAssessment.semester || "",
      course: paper.course,
      coursecode: paper.coursecode,
      assessmentcomponent: finalAssessment.assessmentcomponent,
      assessmentgroup: finalAssessment.assessmentgroup,
      grouptype: finalAssessment.grouptype,
      scoretype: "External",
      totalmarks: number(finalAssessment.marks) || 100,
      weightage,
      marksobtained: total,
      effectivemarks: total * weightage,
      student: text(student.student),
      regno: text(student.regno),
      email: text(student.email),
      phone: text(student.phone),
      faculty: text(student.examinername),
      facultyemail: text(student.examineremail),
      status: "Added",
      colid,
      user: text(req.body.user)
    };

    if (valuationtype === "V1") {
      await NepLmsAssessmentMarks.findOneAndUpdate(
        { colid, academicyear: payload.academicyear, semester: payload.semester, coursecode: payload.coursecode, assessmentcomponent: payload.assessmentcomponent, assessmentgroup: payload.assessmentgroup, regno: payload.regno },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    await ConductExamOnScreenMark.updateMany({ colid, paperid, regno: payload.regno, valuationtype }, { $set: { finalized: "Yes" } });

    if (valuationtype !== "V1") {
      const reval = await ConductExamReevaluation.findOne({
        colid,
        examcode: paper.examcode,
        coursecode: paper.coursecode,
        regno: payload.regno
      });

      if (reval) {
        const timeSec = number(req.body.evaluationTimeSeconds) || 0;
        if (valuationtype === "V2") {
          reval.reevaluator1.marks = total;
          reval.reevaluator1.status = "Evaluated";
          reval.reevaluator1.evaluatedAt = new Date();
          reval.reevaluator1.evaluationTimeSeconds = timeSec;
        } else if (valuationtype === "V3") {
          reval.reevaluator2.marks = total;
          reval.reevaluator2.status = "Evaluated";
          reval.reevaluator2.evaluatedAt = new Date();
          reval.reevaluator2.evaluationTimeSeconds = timeSec;
        } else if (valuationtype === "V4") {
          reval.reevaluator3.marks = total;
          reval.reevaluator3.status = "Evaluated";
          reval.reevaluator3.evaluatedAt = new Date();
          reval.reevaluator3.evaluationTimeSeconds = timeSec;
        }

        const { evaluateDecision } = require("./conductexamreevaluation2ctlrds");
        await evaluateDecision(reval);
      }
    } else {
      await ConductExamExaminerAllotment.updateOne(
        { colid, coursecode: payload.coursecode, regno: payload.regno },
        {
          $set: {
            totalmarksobtained: total,
            evaluationstatus: "Evaluated",
            evaluationdate: new Date().toISOString(),
            evaluationTimeSeconds: number(req.body.evaluationTimeSeconds) || 0,
            verifiedPages: Array.isArray(req.body.verifiedPages || req.body.verifiedpages) ? (req.body.verifiedPages || req.body.verifiedpages) : [],
            verifiedpages: Array.isArray(req.body.verifiedpages || req.body.verifiedPages) ? (req.body.verifiedpages || req.body.verifiedPages) : [],
            pagestamps: Array.isArray(req.body.pagestamps) ? req.body.pagestamps : []
          }
        }
      );
    }

    // Find next pending student
    const nextStudent = await ConductExamExaminerAllotment.findOne({
      colid,
      coursecode: payload.coursecode,
      regno: { $ne: payload.regno },
      evaluationstatus: { $nin: ["Evaluated", "Rejected"] }
    }).sort({ regno: 1 }).lean();

    res.json({
      success: true,
      total,
      sectionTotals,
      assessmentcomponent: payload.assessmentcomponent,
      nextStudentId: nextStudent?._id || null,
      nextRegno: nextStudent?.regno || null,
      hasMorePending: Boolean(nextStudent)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectStudent = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const paperid = text(req.body.paperid);
    const student = req.body.student || {};
    const reason = text(req.body.reason) || "Rejected by Examiner";
    if (colid === undefined || !text(student.regno)) {
      return res.status(400).json({ success: false, message: "colid and student are required" });
    }

    await ConductExamExaminerAllotment.updateOne(
      { colid, coursecode: text(req.body.coursecode || student.coursecode), regno: text(student.regno) },
      {
        $set: {
          evaluationstatus: "Rejected",
          evaluationdate: new Date().toISOString(),
          rejectionreason: reason
        }
      }
    );

    // Find next pending student
    const nextStudent = await ConductExamExaminerAllotment.findOne({
      colid,
      coursecode: text(req.body.coursecode || student.coursecode),
      regno: { $ne: text(student.regno) },
      evaluationstatus: { $nin: ["Evaluated", "Rejected"] }
    }).sort({ regno: 1 }).lean();

    res.json({
      success: true,
      message: "Answer script rejected successfully",
      nextStudentId: nextStudent?._id || null,
      hasMorePending: Boolean(nextStudent)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

