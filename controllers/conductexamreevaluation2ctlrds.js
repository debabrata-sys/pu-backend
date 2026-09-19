const ConductExamReevaluation = require("../Models/conductexamreevaluation2ds");
const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");
const ConductExamExaminer = require("../Models/conductexamexaminer2ds");
const ConductExamQuestionPaper = require("../Models/conductexamquestionpaper2ds");
const ConductExamAnswerBook = require("../Models/conductexamanswerbook2ds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");
const ConductExamOnScreenMark = require("../Models/conductexamonscreenmark2ds");
const reevaluationds1 = require("../Models/reevaluationds1");
const User = require("../Models/user");

const text = (v) => String(v || "").trim();
const colNumber = (v) => {
  const p = Number(v);
  return Number.isNaN(p) ? undefined : p;
};
const uniq = (arr = []) => [...new Set(arr.map((x) => text(x)).filter(Boolean))].sort();

// Helper: automated re-evaluation decision logic
async function evaluateDecision(record) {
  const maxMarks = Number(record.maxmarks) || 75;
  const originalMarks = Number(record.originalmarks) || 0;

  const r1 = record.reevaluator1 || {};
  const r2 = record.reevaluator2 || {};
  const r3 = record.reevaluator3 || {};

  // Check if both Re-evaluator 1 and 2 finished
  if (r1.status === "Evaluated" && r2.status === "Evaluated" && record.status === "UnderReval_1_2") {
    const m1 = Number(r1.marks) || 0;
    const m2 = Number(r2.marks) || 0;
    const avg12 = Number(((m1 + m2) / 2).toFixed(2));
    const diff = Number((avg12 - originalMarks).toFixed(2));
    const pct = Number(((diff / maxMarks) * 100).toFixed(2));

    record.reval12Avg = avg12;
    record.marksDifference = diff;
    record.percentageChange = pct;

    if (diff <= 0) {
      // Marks did not increase -> maintain original marks
      record.finalrevalmarks = originalMarks;
      record.finaldecision = "NoChange_Marks_Not_Increased";
      record.status = "Completed";
    } else if (pct <= 10) {
      // 0 to 10% increase -> no marks will be changed
      record.finalrevalmarks = originalMarks;
      record.finaldecision = "NoChange_0_to_10%";
      record.status = "Completed";
    } else if (pct <= 20) {
      // 10% to 20% increase -> average of re-evaluator 1 and 2 will be new marks
      record.finalrevalmarks = avg12;
      record.finaldecision = "Revised_Avg12_10_to_20%";
      record.status = "Completed";

      // Apply updated marks to assessment & allotment
      await applyNewMarks(record, avg12);
    } else {
      // More than 20% increase -> refer to Re-evaluator 3
      record.status = "ReferredTo_3";
      record.finaldecision = "Referred_To_Reevaluator_3";
      if (!record.reevaluator3) record.reevaluator3 = {};
      record.reevaluator3.status = record.reevaluator3.evaluatorid ? "Pending" : "AwaitingAllotment";
    }
    await record.save();
    return record;
  }

  // Check if Re-evaluator 3 finished after referral
  if (record.status === "UnderReval_3" && r3.status === "Evaluated") {
    const m1 = Number(r1.marks) || 0;
    const m2 = Number(r2.marks) || 0;
    const m3 = Number(r3.marks) || 0;
    const avg123 = Number(((m1 + m2 + m3) / 3).toFixed(2));

    record.reval123Avg = avg123;
    record.finalrevalmarks = avg123;
    record.finaldecision = "Revised_Avg123_Over_20%";
    record.status = "Completed";

    await applyNewMarks(record, avg123);
    await record.save();
    return record;
  }

  await record.save();
  return record;
}

// Update official marks upon revision
async function applyNewMarks(record, newTotal) {
  const { colid, coursecode, regno, academicyear } = record;
  try {
    await NepLmsAssessmentMarks.updateOne(
      { colid, coursecode, regno, assessmentgroup: "SEE" },
      { $set: { marksobtained: newTotal, effectivemarks: newTotal, status: "Reevaluated" } }
    );
    await ConductExamExaminerAllotment.updateOne(
      { colid, coursecode, regno },
      { $set: { totalmarksobtained: newTotal, evaluationstatus: "Reevaluated" } }
    );
  } catch (err) {
    console.error("Error applying new marks for re-evaluation:", err);
  }
}

// 1. Dropdown Options for Re-evaluation Management
exports.getOptions = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const [allotments, examiners, facultyUsers] = await Promise.all([
      ConductExamExaminerAllotment.find({ colid }).sort({ academicyear: -1, exam: 1, course: 1 }).lean(),
      ConductExamExaminer.find({ colid }).sort({ examinername: 1 }).lean(),
      User.find({
        colid,
        $or: [
          { role: { $in: ["Faculty", "phdexaminer", "AR Evaluation", "Examiner", "Evaluator", "CF", "UF", "OE", "PE", "SPE", "COE", "Exam", "Guide", "Admin"] } },
          { designation: { $regex: /professor|lecturer|faculty|evaluator|examiner|reader/i } }
        ]
      }).select("name email role designation department employeeid regno code").sort({ name: 1 }).lean()
    ]);

    const academicyears = uniq(allotments.map((a) => a.academicyear));
    const exams = uniq(allotments.map((a) => a.examcode + "||" + a.exam)).map((v) => {
      const [examcode, exam] = v.split("||");
      return { examcode, exam };
    });
    const programs = uniq(allotments.map((a) => a.programcode + "||" + a.program)).map((v) => {
      const [programcode, program] = v.split("||");
      return { programcode, program };
    });
    const courses = uniq(allotments.map((a) => a.coursecode + "||" + a.course + "||" + a.examcode + "||" + a.programcode)).map((v) => {
      const [coursecode, course, examcode, programcode] = v.split("||");
      return { coursecode, course, examcode, programcode };
    });

    const evaluatorMap = new Map();

    // 1. Add ConductExamExaminer records
    examiners.forEach((e) => {
      const email = text(e.examineremail || e.email);
      if (!email) return;
      const key = email.toLowerCase();
      evaluatorMap.set(key, {
        evaluatorid: text(e.examinercode || e.code || e.employeeid || email.split("@")[0].toUpperCase()),
        name: text(e.examinername || e.name || email),
        email: email,
        institution: text(e.institute || e.acceptancedata?.working_institute || e.department || e.collegename || "People's University")
      });
    });

    // 2. Add Faculty & Evaluation Staff Users
    facultyUsers.forEach((u) => {
      const email = text(u.email || u.username);
      if (!email) return;
      const key = email.toLowerCase();
      if (!evaluatorMap.has(key)) {
        const rawReg = text(u.regno);
        const validReg = rawReg && rawReg.toUpperCase() !== "NA" ? rawReg : "";
        const idVal = text(u.employeeid || validReg || u.code || u.designation || u.role || email.split("@")[0]).toUpperCase();
        evaluatorMap.set(key, {
          evaluatorid: idVal,
          name: text(u.name || email),
          email: email,
          institution: text(u.department || u.designation || "People's University")
        });
      }
    });

    const evaluatorList = Array.from(evaluatorMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      academicyears,
      exams,
      programs,
      courses,
      evaluators: evaluatorList
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Get Evaluated Students Eligible to Apply for Re-evaluation
exports.getEligibleStudents = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    const examcode = text(req.query.examcode);
    const coursecode = text(req.query.coursecode);
    if (colid === undefined || !examcode || !coursecode) {
      return res.status(400).json({ success: false, message: "colid, examcode, and coursecode are required" });
    }

    const [allotments, existingRevals, qp, onscreenMarks, studentApps] = await Promise.all([
      ConductExamExaminerAllotment.find({ colid, examcode, coursecode, evaluationstatus: /^Evaluated$/i }).sort({ regno: 1 }).lean(),
      ConductExamReevaluation.find({ colid, examcode, coursecode }).lean(),
      ConductExamQuestionPaper.findOne({ colid, coursecode }).sort({ updatedAt: -1 }).lean(),
      ConductExamOnScreenMark.find({ colid, coursecode }).lean(),
      reevaluationds1.find({ colid, examcode, papercode: coursecode }).lean()
    ]);

    const maxMarks = Number(qp?.totalmarks) || 100;
    const markGroup = new Map();
    onscreenMarks.forEach((m) => {
      if (!markGroup.has(m.regno)) markGroup.set(m.regno, 0);
      markGroup.set(m.regno, markGroup.get(m.regno) + (Number(m.marks) || 0));
    });

    const getMarks = (a) => {
      if (a.totalmarksobtained != null && !isNaN(Number(a.totalmarksobtained))) {
        return Number(a.totalmarksobtained);
      }
      return markGroup.get(a.regno) || 0;
    };

    const revalMap = new Map(existingRevals.map((r) => [r.regno, r]));

    // Auto-sync any applications submitted from student portal (reevaluationds1)
    for (const app of studentApps) {
      if (!revalMap.has(app.regno)) {
        const allot = allotments.find((a) => a.regno === app.regno) || {};
        const origMarks = Number(app.originalmarks) || getMarks(allot);
        try {
          const newReval = await ConductExamReevaluation.create({
            colid,
            academicyear: allot.academicyear || "2026-27",
            exam: allot.exam || app.examcode || "Ph.D Course Work_MAIN-JUNE-2026",
            examcode,
            regulation: allot.regulation || app.regulation || "R2020",
            program: allot.program || app.program || "PhD",
            programcode: allot.programcode || app.program || "PHD-002",
            subject: allot.subject || app.branch || "",
            course: allot.course || app.papername || "Research Methodology",
            coursecode,
            paperid: qp?._id || null,
            student: app.student || allot.student || app.name,
            regno: app.regno,
            cn: allot.cn || "",
            maxmarks: app.maxmarks || maxMarks,
            originalmarks: origMarks,
            originalevaluatorid: allot.evaluatorid || "",
            originalevaluatorname: allot.examinername || "",
            status: "Applied",
            user: app.user || "student"
          });
          revalMap.set(app.regno, newReval.toObject());
        } catch (syncErr) {
          console.error("Error syncing student app into ConductExamReevaluation:", syncErr);
        }
      }
    }

    const students = allotments.map((a) => {
      const reval = revalMap.get(a.regno);
      const marks = getMarks(a);
      return {
        regno: a.regno,
        student: a.student,
        cn: a.cn || "",
        originalmarks: marks,
        evaluatorid: a.evaluatorid || "",
        evaluatorname: a.examinername || "",
        maxmarks: maxMarks,
        alreadyApplied: !!reval,
        revalStatus: reval?.status || "NotApplied"
      };
    });

    res.json({ success: true, students, maxMarks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. Apply Student(s) for Re-evaluation
exports.applyReevaluation = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const examcode = text(req.body.examcode);
    const coursecode = text(req.body.coursecode);
    const studentList = Array.isArray(req.body.students) ? req.body.students : [];

    if (colid === undefined || !examcode || !coursecode || !studentList.length) {
      return res.status(400).json({ success: false, message: "colid, examcode, coursecode and students are required" });
    }

    const [allotments, qp, onscreenMarks] = await Promise.all([
      ConductExamExaminerAllotment.find({ colid, examcode, coursecode, regno: { $in: studentList } }).lean(),
      ConductExamQuestionPaper.findOne({ colid, coursecode }).sort({ updatedAt: -1 }).lean(),
      ConductExamOnScreenMark.find({ colid, coursecode, regno: { $in: studentList } }).lean()
    ]);

    const markGroup = new Map();
    onscreenMarks.forEach((m) => {
      if (!markGroup.has(m.regno)) markGroup.set(m.regno, 0);
      markGroup.set(m.regno, markGroup.get(m.regno) + (Number(m.marks) || 0));
    });

    const maxMarks = Number(qp?.totalmarks) || 100;
    const ops = [];

    allotments.forEach((allot) => {
      const origMarks = (allot.totalmarksobtained != null && !isNaN(Number(allot.totalmarksobtained)))
        ? Number(allot.totalmarksobtained)
        : (markGroup.get(allot.regno) || 0);

      ops.push({
        updateOne: {
          filter: { colid, examcode, coursecode, regno: allot.regno },
          update: {
            $set: {
              colid,
              academicyear: allot.academicyear,
              exam: allot.exam,
              examcode: allot.examcode,
              regulation: allot.regulation || "R2020",
              program: allot.program || "PhD",
              programcode: allot.programcode || "PHD-002",
              subject: allot.subject || "",
              course: allot.course,
              coursecode: allot.coursecode,
              paperid: qp?._id || null,
              student: allot.student,
              regno: allot.regno,
              cn: allot.cn || "",
              maxmarks: maxMarks,
              originalmarks: origMarks,
              originalevaluatorid: allot.evaluatorid || "",
              originalevaluatorname: allot.examinername || "",
              status: "Applied",
              user: text(req.body.user)
            }
          },
          upsert: true
        }
      });
    });

    if (ops.length) {
      await ConductExamReevaluation.bulkWrite(ops, { ordered: false });
    }

    // Also sync to reevaluationds1 so student can track their status in Student Portal
    for (const allot of allotments) {
      const origMarks = (allot.totalmarksobtained != null && !isNaN(Number(allot.totalmarksobtained)))
        ? Number(allot.totalmarksobtained)
        : (markGroup.get(allot.regno) || 0);

      const existsInStud = await reevaluationds1.findOne({ colid, examcode, papercode: coursecode, regno: allot.regno });
      if (!existsInStud) {
        await reevaluationds1.create({
          student: allot.student,
          regno: allot.regno,
          name: allot.student,
          user: text(req.body.user),
          colid,
          program: allot.program || allot.programcode,
          examcode,
          month: "June",
          year: allot.academicyear ? allot.academicyear.split("-")[0] : "2026",
          regulation: allot.regulation || "R2020",
          semester: allot.semester || "1",
          branch: allot.subject || "PhD",
          papercode: coursecode,
          papername: allot.course,
          originalmarks: origMarks,
          maxmarks: maxMarks,
          examiner1status: "pending",
          examiner2status: "pending",
          examiner3status: "pending",
          status: "pending",
          applieddate: new Date()
        });
      }
    }

    res.json({ success: true, count: ops.length, message: "Successfully applied students for re-evaluation" });
  } catch (err) {
    console.error("applyReevaluation error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. Allot Re-evaluator 1 (V2) & Re-evaluator 2 (V3) in Parallel
exports.allotReevaluators = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const regnos = Array.isArray(req.body.regnos) ? req.body.regnos : [];
    const reevaluator1 = req.body.reevaluator1 || {};
    const reevaluator2 = req.body.reevaluator2 || {};

    if (colid === undefined || !regnos.length || !reevaluator1.email || !reevaluator2.email) {
      return res.status(400).json({ success: false, message: "colid, regnos, reevaluator1, and reevaluator2 are required" });
    }

    if (reevaluator1.email.toLowerCase() === reevaluator2.email.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Re-evaluator 1 and Re-evaluator 2 must be different evaluators" });
    }

    const updatePayload = {
      status: "UnderReval_1_2",
      reevaluator1: {
        evaluatorid: text(reevaluator1.evaluatorid),
        name: text(reevaluator1.name),
        email: text(reevaluator1.email).toLowerCase(),
        status: "Pending",
        marks: null
      },
      reevaluator2: {
        evaluatorid: text(reevaluator2.evaluatorid),
        name: text(reevaluator2.name),
        email: text(reevaluator2.email).toLowerCase(),
        status: "Pending",
        marks: null
      }
    };

    const result = await ConductExamReevaluation.updateMany(
      { colid, regno: { $in: regnos } },
      { $set: updatePayload }
    );

    // Sync status to student portal collection reevaluationds1
    await reevaluationds1.updateMany(
      { colid, regno: { $in: regnos } },
      {
        $set: {
          examiner1id: reevaluator1.email,
          examiner2id: reevaluator2.email,
          examiner1status: "allocated",
          examiner2status: "allocated",
          status: "stage1"
        }
      }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: "Successfully allotted Re-evaluator 1 and 2 in parallel"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 5. Allot Re-evaluator 3 (V4) for Papers with >20% Increase
exports.allotReevaluator3 = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const regnos = Array.isArray(req.body.regnos) ? req.body.regnos : [];
    const reevaluator3 = req.body.reevaluator3 || {};

    if (colid === undefined || !regnos.length || !reevaluator3.email) {
      return res.status(400).json({ success: false, message: "colid, regnos, and reevaluator3 are required" });
    }

    const updatePayload = {
      status: "UnderReval_3",
      reevaluator3: {
        evaluatorid: text(reevaluator3.evaluatorid),
        name: text(reevaluator3.name),
        email: text(reevaluator3.email).toLowerCase(),
        status: "Pending",
        marks: null
      }
    };

    const result = await ConductExamReevaluation.updateMany(
      { colid, regno: { $in: regnos }, status: "ReferredTo_3" },
      { $set: updatePayload }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: "Successfully allotted Re-evaluator 3"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 6. List Re-evaluation Applications & Status
exports.listReevaluations = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filter = { colid };
    if (text(req.query.academicyear)) filter.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) filter.examcode = text(req.query.examcode);
    if (text(req.query.coursecode)) filter.coursecode = text(req.query.coursecode);
    if (text(req.query.status)) filter.status = text(req.query.status);

    // Auto-sync any pending applications from reevaluationds1 for this course
    if (filter.examcode && filter.coursecode) {
      const studentApps = await reevaluationds1.find({
        colid,
        examcode: filter.examcode,
        papercode: filter.coursecode
      }).lean();

      for (const app of studentApps) {
        const exists = await ConductExamReevaluation.findOne({
          colid,
          examcode: filter.examcode,
          coursecode: filter.coursecode,
          regno: app.regno
        });
        if (!exists) {
          const allot = await ConductExamExaminerAllotment.findOne({
            colid,
            examcode: filter.examcode,
            coursecode: filter.coursecode,
            regno: app.regno
          }).lean();

          try {
            await ConductExamReevaluation.create({
              colid,
              academicyear: allot?.academicyear || "2026-27",
              exam: allot?.exam || app.examcode || "Ph.D Course Work_MAIN-JUNE-2026",
              examcode: filter.examcode,
              regulation: allot?.regulation || app.regulation || "R2020",
              program: allot?.program || app.program || "PhD",
              programcode: allot?.programcode || app.program || "PHD-002",
              subject: allot?.subject || app.branch || "",
              course: allot?.course || app.papername || "Research Methodology",
              coursecode: filter.coursecode,
              student: app.student || allot?.student || app.name,
              regno: app.regno,
              cn: allot?.cn || "",
              maxmarks: app.maxmarks || 100,
              originalmarks: Number(app.originalmarks) || 52,
              originalevaluatorid: allot?.evaluatorid || "",
              originalevaluatorname: allot?.examinername || "",
              status: "Applied",
              user: app.user || "student"
            });
          } catch (createErr) {
            console.error("Error creating synced ConductExamReevaluation:", createErr);
          }
        }
      }
    }

    const revals = await ConductExamReevaluation.find(filter).sort({ updatedAt: -1, regno: 1 }).lean();

    res.json({ success: true, count: revals.length, reevaluations: revals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 7. Manual trigger to re-check decision
exports.processDecision = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const id = req.body.id;
    const record = await ConductExamReevaluation.findOne({ _id: id, colid });
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    const updated = await evaluateDecision(record);
    res.json({ success: true, record: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.evaluateDecision = evaluateDecision;
