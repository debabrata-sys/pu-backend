const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamExaminer = require("../Models/conductexamexaminer2ds");
const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");
const ConductExamRateCard = require("../Models/conductexamratecard2ds");
const CourseAssessment = require("../Models/courseassessmentds");
const NepLmsAssessmentMarks = require("../Models/neplmsassessmentmarksds");
const User = require("../Models/user");
const { getExamConfigHelper } = require("./conductexamconfigurationctlrds");
const { sendAppointmentLetterEmail } = require("../utils/conductExamAppointmentEmailHelper");

const numberToWords = (num) => {
  const a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const n = ("000000000" + Math.floor(Number(num) || 0)).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return "Zero Rupees Only";
  let str = "";
  str += Number(n[1]) !== 0 ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
  str += Number(n[2]) !== 0 ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh " : "";
  str += Number(n[3]) !== 0 ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
  str += Number(n[4]) !== 0 ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
  str += Number(n[5]) !== 0 ? ((str !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
  return str.trim() ? `${str.trim()} Rupees Only` : "Zero Rupees Only";
};

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values) => [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const baseCoursePayload = (body = {}) => ({
  colid: number(body.colid),
  academicyear: text(body.academicyear || body.academicYear),
  regulation: text(body.regulation),
  exam: text(body.exam || body.examname),
  examcode: text(body.examcode),
  program: text(body.program),
  programcode: text(body.programcode),
  type: text(body.type),
  subject: text(body.subject),
  semester: text(body.semester),
  course: text(body.course),
  coursecode: text(body.coursecode),
  user: text(body.user)
});

const examinerPayload = (body = {}) => ({
  ...baseCoursePayload(body),
  examinername: text(body.examinername || body.examiner || body.name),
  examineremail: text(body.examineremail || body.email),
  examinercode: text(body.examinercode)
});

const allotmentPayload = (body = {}) => ({
  ...baseCoursePayload(body),
  examinername: text(body.examinername || body.examiner || body.name),
  examineremail: text(body.examineremail || body.email),
  student: text(body.student),
  regno: text(body.regno),
  email: text(body.studentemail || body.emailstudent || body.studentEmail || body.emailid || body.ledgeremail || body.email),
  seatno: text(body.seatno),
  examdate: text(body.examdate),
  examslot: text(body.examslot || body.slot),
  startdate: text(body.startdate),
  enddate: text(body.enddate),
  status: text(body.status) || "Allocated",
  evaluationstatus: text(body.evaluationstatus),
  evaluationdate: text(body.evaluationdate)
});

const buildFilter = (source = {}, fields = []) => {
  const filter = {};
  const colid = number(source.colid);
  if (colid !== undefined) filter.colid = colid;
  fields.forEach((field) => {
    if (text(source[field])) filter[field] = text(source[field]);
  });
  return filter;
};

const courseFields = ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"];
const examinerFields = [...courseFields, "examinername", "examineremail"];
const allotmentFields = [...courseFields, "examinername", "examineremail", "student", "regno", "examdate", "examslot", "startdate", "enddate", "status"];

const validateCourse = (item) => {
  if (item.colid === undefined) return "colid is required";
  for (const field of ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "course", "coursecode"]) {
    if (!item[field]) return `${field} is required`;
  }
  return "";
};

const validateExaminer = (item) => validateCourse(item) || (!item.examinername ? "examinername is required" : "") || (!item.examineremail ? "examineremail is required" : "");
const validateAllotment = (item) => validateExaminer(item) || (!item.student ? "student is required" : "") || (!item.regno ? "regno is required" : "") || (!item.startdate ? "startdate is required" : "") || (!item.enddate ? "enddate is required" : "");

const courseSort = { academicyear: -1, examcode: 1, regulation: 1, program: 1, course: 1 };

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const courseFilter = buildFilter(req.query, courseFields);
    const [courses, initialExaminers, users] = await Promise.all([
      ConductExamCourse.find(courseFilter).sort(courseSort).lean(),
      ConductExamExaminer.find({ colid }).sort({ examinername: 1 }).lean(),
      User.find({ colid, role: { $not: /^Student$/i } }).select("name email role department").sort({ name: 1, email: 1 }).lean()
    ]);
    let examiners = initialExaminers;
    if (!examiners.length) {
      const ConductExamExaminerV1 = require("../Models/conductexamexaminerds");
      examiners = await ConductExamExaminerV1.find({ colid }).sort({ examinername: 1 }).lean();
    }
    res.json({
      success: true,
      courses,
      examiners,
      users,
      academicyears: uniq(courses.map((row) => row.academicyear)),
      examcodes: uniq(courses.map((row) => row.examcode)),
      regulations: uniq(courses.map((row) => row.regulation)),
      programs: uniq(courses.map((row) => `${row.programcode}||${row.program}`)).map((value) => {
        const [programcode, program] = value.split("||");
        return { programcode, program };
      }),
      coursesList: uniq(courses.map((row) => `${row.coursecode}||${row.course}`)).map((value) => {
        const [coursecode, course] = value.split("||");
        return { coursecode, course };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExaminers = async (req, res) => {
  try {
    const filter = buildFilter(req.query, examinerFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamExaminer.find(filter).sort(courseSort).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveExaminer = async (req, res) => {
  try {
    const item = examinerPayload(req.body);
    const error = validateExaminer(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = req.body.id
      ? await ConductExamExaminer.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ConductExamExaminer.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, examineremail: item.examineremail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "This examiner is already added for this course" : err.message });
  }
};

exports.deleteExaminer = async (req, res) => {
  try {
    await ConductExamExaminer.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkExaminers = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = examinerPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateExaminer(item);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await ConductExamExaminer.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, examineremail: item.examineremail },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.presentStudents = async (req, res) => {
  try {
    const filter = buildFilter(req.query, ["academicyear", "regulation", "exam", "examcode", "program", "programcode", "type", "subject", "semester", "course", "coursecode"]);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    ["academicyear", "examcode", "programcode", "coursecode"].forEach((field) => {
      if (!filter[field]) throw new Error(`${field} is required`);
    });
    filter.attended = "Yes";
    const data = await ConductExamRoll.find(filter).sort({ seatno: 1, student: 1, regno: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAllotments = async (req, res) => {
  try {
    const filter = buildFilter(req.query, allotmentFields);
    if (filter.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ConductExamExaminerAllotment.find(filter).sort({ academicyear: -1, examcode: 1, course: 1, examinername: 1, student: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveAllotment = async (req, res) => {
  try {
    const item = allotmentPayload(req.body);
    const error = validateAllotment(item);
    if (error) return res.status(400).json({ success: false, message: error });
    const present = await ConductExamRoll.findOne({
      colid: item.colid,
      academicyear: item.academicyear,
      examcode: item.examcode,
      programcode: item.programcode,
      coursecode: item.coursecode,
      regno: item.regno,
      attended: "Yes"
    }).lean();
    if (!present) return res.status(400).json({ success: false, message: "Only students with attended Yes can be allotted" });
    const data = req.body.id
      ? await ConductExamExaminerAllotment.findOneAndUpdate({ _id: req.body.id, colid: item.colid }, item, { new: true, runValidators: true })
      : await ConductExamExaminerAllotment.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

    // Auto-record examiner in ConductExamExaminer for this course if missing
    if (item.examineremail) {
      await ConductExamExaminer.findOneAndUpdate(
        { colid: item.colid, coursecode: item.coursecode, examineremail: item.examineremail },
        {
          $setOnInsert: {
            colid: item.colid,
            academicyear: item.academicyear,
            regulation: item.regulation,
            exam: item.exam,
            examcode: item.examcode,
            program: item.program,
            programcode: item.programcode,
            type: item.type,
            subject: item.subject,
            semester: item.semester,
            course: item.course,
            coursecode: item.coursecode,
            examinername: item.examinername,
            examineremail: item.examineremail,
            examinercode: item.examinercode || "",
            user: item.user
          }
        },
        { upsert: true }
      ).catch(() => {});
    }

    // Asynchronously send appointment letter email
    sendAppointmentLetterEmail({ colid: item.colid, type: "evaluator", record: data || item })
      .catch((e) => console.error("[EvaluatorAllotment] Error sending appointment letter:", e.message));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === 11000 ? "This student is already allotted for this course" : err.message });
  }
};

exports.deleteAllotment = async (req, res) => {
  try {
    await ConductExamExaminerAllotment.findOneAndDelete({ _id: req.body.id, colid: number(req.body.colid) });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAllotmentsBulk = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one allotment row" });
    const result = await ConductExamExaminerAllotment.deleteMany({ colid, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkAllotments = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const errors = [];
    let saved = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = allotmentPayload({ ...items[index], colid: req.body.colid || items[index].colid, user: req.body.user || items[index].user });
      const error = validateAllotment(item);
      if (error) {
        errors.push({ rowNumber: items[index].rowNumber || index + 2, message: error });
        continue;
      }
      await ConductExamExaminerAllotment.findOneAndUpdate(
        { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno },
        item,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }

    const notifiedEmails = new Set();
    items.forEach((it) => {
      const email = text(it.examineremail || it.email).toLowerCase();
      if (email && !notifiedEmails.has(email)) {
        notifiedEmails.add(email);
        sendAppointmentLetterEmail({ colid: req.body.colid || it.colid, type: "evaluator", record: it })
          .catch((e) => console.error("[BulkAllotments] Error sending letter:", e.message));
      }
    });

    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.randomAllot = async (req, res) => {
  try {
    const base = baseCoursePayload(req.body);
    const error = validateCourse(base);
    if (error) return res.status(400).json({ success: false, message: error });
    const startdate = text(req.body.startdate);
    const enddate = text(req.body.enddate);
    if (!startdate) return res.status(400).json({ success: false, message: "startdate is required" });
    if (!enddate) return res.status(400).json({ success: false, message: "enddate is required" });
    const selectedEmails = Array.isArray(req.body.examineremails) ? req.body.examineremails.map(text).filter(Boolean) : [];
    if (!selectedEmails.length) return res.status(400).json({ success: false, message: "Select at least one examiner" });
    const papersPerExaminer = number(req.body.papersperexaminer);

    let examiners = await ConductExamExaminer.find({
      colid: base.colid,
      examineremail: { $in: selectedEmails.map((email) => new RegExp(`^${escapeRegex(email)}$`, "i")) }
    }).lean();

    // Map unique examiners by lowercase email
    const uniqueExaminersMap = new Map();
    examiners.forEach((ex) => {
      const em = text(ex.examineremail).toLowerCase();
      if (!uniqueExaminersMap.has(em)) {
        uniqueExaminersMap.set(em, ex);
      }
    });

    // For any email not found in ConductExamExaminer, look up in User
    for (const email of selectedEmails) {
      const em = text(email).toLowerCase();
      if (!uniqueExaminersMap.has(em)) {
        const u = await User.findOne({
          colid: base.colid,
          email: new RegExp(`^${escapeRegex(email)}$`, "i")
        }).select("name email").lean();

        if (u) {
          const newEx = {
            colid: base.colid,
            academicyear: base.academicyear,
            regulation: base.regulation,
            exam: base.exam,
            examcode: base.examcode,
            program: base.program,
            programcode: base.programcode,
            type: base.type || "",
            subject: base.subject || "",
            semester: base.semester || "",
            course: base.course,
            coursecode: base.coursecode,
            examinername: u.name || u.email,
            examineremail: u.email,
            examinercode: "",
            user: base.user
          };
          uniqueExaminersMap.set(em, newEx);
        }
      }
    }

    examiners = Array.from(uniqueExaminersMap.values());
    if (!examiners.length) return res.status(400).json({ success: false, message: "No examiners found for selected emails" });

    // Upsert any missing examiner into ConductExamExaminer for this course
    for (const ex of examiners) {
      await ConductExamExaminer.findOneAndUpdate(
        { colid: base.colid, coursecode: base.coursecode, examineremail: ex.examineremail },
        {
          $setOnInsert: {
            colid: base.colid,
            academicyear: base.academicyear,
            regulation: base.regulation,
            exam: base.exam,
            examcode: base.examcode,
            program: base.program,
            programcode: base.programcode,
            type: base.type || ex.type || "",
            subject: base.subject || ex.subject || "",
            semester: base.semester || ex.semester || "",
            course: base.course,
            coursecode: base.coursecode,
            examinername: ex.examinername,
            examineremail: ex.examineremail,
            examinercode: ex.examinercode || "",
            user: base.user
          }
        },
        { upsert: true }
      ).catch(() => {});
    }

    const students = await ConductExamRoll.find({
      colid: base.colid,
      academicyear: base.academicyear,
      examcode: base.examcode,
      regulation: base.regulation,
      programcode: base.programcode,
      coursecode: base.coursecode,
      attended: "Yes"
    }).sort({ regno: 1 }).lean();
    if (!students.length) return res.status(400).json({ success: false, message: "No present students found for this course" });

    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const assignments = [];
    const max = papersPerExaminer ? Math.min(shuffled.length, papersPerExaminer * examiners.length) : shuffled.length;
    for (let index = 0; index < max; index += 1) {
      const student = shuffled[index];
      const examiner = examiners[index % examiners.length];
      assignments.push({
        ...base,
        type: base.type || student.type || examiner.type || "",
        subject: base.subject || student.subject || examiner.subject || "",
        semester: base.semester || student.semester || examiner.semester || "",
        examinername: examiner.examinername,
        examineremail: examiner.examineremail,
        student: student.student,
        regno: student.regno,
        email: student.email || "",
        seatno: student.seatno || "",
        examdate: student.examdate || "",
        examslot: student.examslot || "",
        startdate,
        enddate,
        status: "Allocated",
        evaluationstatus: "",
        evaluationdate: ""
      });
    }

    await ConductExamExaminerAllotment.bulkWrite(assignments.map((item) => ({
      updateOne: {
        filter: { colid: item.colid, academicyear: item.academicyear, examcode: item.examcode, programcode: item.programcode, coursecode: item.coursecode, regno: item.regno },
        update: { $set: item },
        upsert: true
      }
    })));

    // Send appointment letters to unique allotted examiners
    examiners.forEach((ex) => {
      sendAppointmentLetterEmail({
        colid: base.colid,
        type: "evaluator",
        record: { ...base, examinername: ex.examinername, examineremail: ex.examineremail, examinercode: ex.examinercode }
      }).catch((e) => console.error("[RandomAllot] Error sending letter:", e.message));
    });

    const data = await ConductExamExaminerAllotment.find({
      colid: base.colid,
      academicyear: base.academicyear,
      examcode: base.examcode,
      programcode: base.programcode,
      coursecode: base.coursecode
    }).sort({ examinername: 1, student: 1 }).lean();
    res.json({ success: true, saved: assignments.length, unallocated: shuffled.length - assignments.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExaminerPapersForMarks = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!examineremail) return res.status(400).json({ success: false, message: "examineremail is required" });

    const filter = { colid, examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i") };
    if (text(req.query.startdate)) filter.enddate = { $gte: text(req.query.startdate) };
    if (text(req.query.enddate)) filter.startdate = { $lte: text(req.query.enddate) };

    const rows = await ConductExamExaminerAllotment.find(filter)
      .sort({ academicyear: -1, examcode: 1, startdate: 1, enddate: 1, course: 1 })
      .lean();
    const paperMap = new Map();
    rows.forEach((row) => {
      const key = [
        row.academicyear,
        row.regulation,
        row.examcode,
        row.programcode,
        row.coursecode,
        row.startdate,
        row.enddate
      ].join("||");
      if (!paperMap.has(key)) {
        paperMap.set(key, {
          academicyear: row.academicyear,
          regulation: row.regulation,
          exam: row.exam,
          examcode: row.examcode,
          program: row.program,
          programcode: row.programcode,
          type: row.type,
          subject: row.subject,
          semester: row.semester,
          course: row.course,
          coursecode: row.coursecode,
          examinername: row.examinername,
          examineremail: row.examineremail,
          startdate: row.startdate,
          enddate: row.enddate,
          students: 0
        });
      }
      paperMap.get(key).students += 1;
    });
    res.json({ success: true, data: [...paperMap.values()] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExaminerExternalComponents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, scoretype: /^External$/i };
    ["academicyear", "regulation", "program", "programcode", "course", "coursecode"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    const data = await CourseAssessment.find(query)
      .sort({ assessmentgroup: 1, grouptype: 1, assessmentcomponent: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExaminerStudentsForMarks = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const examineremail = text(req.query.examineremail || req.query.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!examineremail) return res.status(400).json({ success: false, message: "examineremail is required" });

    const allotmentQuery = {
      colid,
      examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i")
    };
    ["academicyear", "regulation", "examcode", "programcode", "coursecode", "startdate", "enddate"].forEach((field) => {
      if (text(req.query[field])) allotmentQuery[field] = text(req.query[field]);
    });
    const students = await ConductExamExaminerAllotment.find(allotmentQuery)
      .sort({ regno: 1, student: 1 })
      .lean();

    const markQuery = {
      colid,
      academicyear: text(req.query.academicyear),
      semester: text(req.query.semester),
      coursecode: text(req.query.coursecode),
      assessmentcomponent: text(req.query.assessmentcomponent),
      assessmentgroup: text(req.query.assessmentgroup)
    };
    const marks = await NepLmsAssessmentMarks.find(markQuery).lean();
    const markMap = new Map(marks.map((item) => [item.regno, item]));

    res.json({
      success: true,
      data: students.map((student) => {
        const mark = markMap.get(student.regno);
        return {
          ...student,
          marksid: mark?._id || "",
          marksobtained: mark?.marksobtained ?? "",
          effectivemarks: mark?.effectivemarks ?? ""
        };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveExaminerExternalMarks = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const paper = req.body.paper || {};
    const assessment = req.body.assessment || {};
    const marksRows = Array.isArray(req.body.marks) ? req.body.marks : [];
    const totalmarks = number(assessment.marks) || 0;
    const weightage = number(assessment.weightage) || 0;

    if (!marksRows.length) return res.status(400).json({ success: false, message: "No marks received" });
    if (!text(assessment.assessmentcomponent)) return res.status(400).json({ success: false, message: "Assessment component is required" });

    const errors = [];
    const ops = [];
    marksRows.forEach((row, index) => {
      const regno = text(row.regno);
      const marksobtained = text(row.marksobtained) === "" ? undefined : number(row.marksobtained);
      if (!regno) {
        errors.push({ rowNumber: index + 1, message: "regno is required" });
        return;
      }
      if (marksobtained === undefined) return;
      if (marksobtained < 0 || marksobtained > totalmarks) {
        errors.push({ rowNumber: index + 1, regno, message: `Marks cannot be more than ${totalmarks}` });
        return;
      }
      const payload = {
        academicyear: text(paper.academicyear || assessment.academicyear),
        regulation: text(paper.regulation || assessment.regulation),
        program: text(paper.program || assessment.program),
        programcode: text(paper.programcode || assessment.programcode),
        type: text(paper.type || assessment.type),
        subject: text(paper.subject || assessment.subject),
        semester: text(paper.semester || assessment.semester),
        course: text(paper.course || assessment.course),
        coursecode: text(paper.coursecode || assessment.coursecode),
        assessmentcomponent: text(assessment.assessmentcomponent),
        assessmentgroup: text(assessment.assessmentgroup),
        grouptype: text(assessment.grouptype),
        scoretype: "External",
        totalmarks,
        weightage,
        marksobtained,
        effectivemarks: marksobtained * weightage,
        student: text(row.student),
        regno,
        email: text(row.email),
        phone: text(row.phone),
        faculty: text(paper.examinername),
        facultyemail: text(paper.examineremail),
        status: "Added",
        colid,
        user: text(req.body.user)
      };
      ops.push({
        updateOne: {
          filter: {
            colid,
            academicyear: payload.academicyear,
            semester: payload.semester,
            coursecode: payload.coursecode,
            assessmentcomponent: payload.assessmentcomponent,
            assessmentgroup: payload.assessmentgroup,
            regno
          },
          update: { $set: payload },
          upsert: true
        }
      });
    });

    let saved = 0;
    if (ops.length) {
      const result = await NepLmsAssessmentMarks.bulkWrite(ops, { ordered: false });
      saved = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendAppointmentLetter = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const allotmentId = text(req.body.id || req.body.allotmentid);
    if (colid === undefined || !allotmentId) {
      return res.status(400).json({ success: false, message: "colid and id are required" });
    }
    const allotment = await ConductExamExaminerAllotment.findOne({ _id: allotmentId, colid }).lean();
    if (!allotment) return res.status(404).json({ success: false, message: "Allotment not found" });
    const result = await sendAppointmentLetterEmail({ colid, type: "evaluator", record: allotment });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.acceptForm = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const examinerid = text(req.body.examinerid || req.body.id || req.body.allotmentid);
    const examineremail = text(req.body.examineremail || req.body.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const acceptancedata = req.body.acceptancedata || {};
    const bankdetails = req.body.bankdetails ? {
      accountholdername: text(req.body.bankdetails.accountholdername),
      panno: text(req.body.bankdetails.panno),
      accountno: text(req.body.bankdetails.accountno),
      ifsccode: text(req.body.bankdetails.ifsccode),
      bankname: text(req.body.bankdetails.bankname),
      branch: text(req.body.bankdetails.branch)
    } : undefined;

    const updateData = {
      acceptancestatus: "Accepted",
      acceptancedate: new Date(),
      acceptancedata,
      ...(bankdetails ? { bankdetails } : {})
    };

    let examiner = null;
    if (examinerid) {
      examiner = await ConductExamExaminer.findOneAndUpdate({ _id: examinerid, colid }, updateData, { new: true });
    }
    if (!examiner && examineremail) {
      examiner = await ConductExamExaminer.findOneAndUpdate(
        { colid, examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i") },
        updateData,
        { new: true }
      );
    }

    const allotmentFilter = { colid };
    if (examiner?.examineremail || examineremail) {
      allotmentFilter.examineremail = new RegExp(`^${escapeRegex(examiner?.examineremail || examineremail)}$`, "i");
    } else if (examinerid) {
      allotmentFilter._id = examinerid;
    }
    await ConductExamExaminerAllotment.updateMany(allotmentFilter, { $set: updateData });

    const targetEmail = examineremail || examiner?.examineremail;
    if (targetEmail) {
      await User.findOneAndUpdate(
        { email: new RegExp(`^${escapeRegex(targetEmail)}$`, "i") },
        {
          ...(acceptancedata.mobile_no || acceptancedata.working_mobile ? { phone: acceptancedata.mobile_no || acceptancedata.working_mobile } : {}),
          ...(acceptancedata.residential_address ? { address: acceptancedata.residential_address } : {}),
          ...(bankdetails?.panno ? { pan: bankdetails.panno } : {})
        }
      );
    }

    res.json({ success: true, message: "Acceptance form submitted successfully", examiner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitDeclaration = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const examinerid = text(req.body.examinerid || req.body.id);
    const examineremail = text(req.body.examineremail || req.body.user);
    const declarationdata = req.body.declarationdata || {};

    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const updateData = {
      declarationstatus: "Accepted",
      declarationdate: new Date(),
      declarationdata
    };

    let examiner = null;
    if (examinerid) {
      examiner = await ConductExamExaminer.findOneAndUpdate({ _id: examinerid, colid }, updateData, { new: true });
    }
    if (!examiner && examineremail) {
      examiner = await ConductExamExaminer.findOneAndUpdate(
        { colid, examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i") },
        updateData,
        { new: true }
      );
    }

    const allotmentFilter = { colid };
    if (examiner?.examineremail || examineremail) {
      allotmentFilter.examineremail = new RegExp(`^${escapeRegex(examiner?.examineremail || examineremail)}$`, "i");
    } else if (examinerid) {
      allotmentFilter._id = examinerid;
    }
    await ConductExamExaminerAllotment.updateMany(allotmentFilter, { $set: updateData });

    res.json({ success: true, message: "Declaration submitted successfully", examiner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRemunerationBill = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const examinerid = text(req.query.examinerid || req.query.id);
    const examineremail = text(req.query.examineremail || req.query.user);
    const coursecode = text(req.query.coursecode);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    let examiner = null;
    if (examinerid) {
      examiner = await ConductExamExaminer.findOne({ _id: examinerid, colid }).lean();
      if (!examiner) examiner = await ConductExamExaminerAllotment.findOne({ _id: examinerid, colid }).lean();
    }
    if (!examiner && examineremail) {
      examiner = await ConductExamExaminer.findOne({
        colid,
        examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i"),
        ...(coursecode ? { coursecode } : {})
      }).lean();
      if (!examiner) {
        examiner = await ConductExamExaminerAllotment.findOne({
          colid,
          examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i"),
          ...(coursecode ? { coursecode } : {})
        }).lean();
      }
    }

    if (!examiner) {
      return res.status(404).json({ success: false, message: "Examiner/allotment record not found" });
    }

    // Fetch rate from ConductExamRateCard (examinerrate)
    let rateCard = await ConductExamRateCard.findOne({
      colid,
      academicyear: examiner.academicyear,
      examcode: examiner.examcode,
      programcode: examiner.programcode,
      coursecode: examiner.coursecode
    }).lean();

    if (!rateCard) {
      rateCard = await ConductExamRateCard.findOne({
        colid,
        academicyear: examiner.academicyear,
        examcode: examiner.examcode,
        coursecode: examiner.coursecode
      }).lean();
    }
    if (!rateCard) {
      rateCard = await ConductExamRateCard.findOne({
        colid,
        coursecode: examiner.coursecode
      }).lean();
    }
    if (!rateCard) {
      rateCard = await ConductExamRateCard.findOne({ colid }).lean();
    }

    const rate = Number(rateCard?.examinerrate || 0);

    // Count evaluated answer books
    const emailRegex = new RegExp(`^${escapeRegex(examiner.examineremail)}$`, "i");
    const totalAllotted = await ConductExamExaminerAllotment.countDocuments({
      colid,
      examineremail: emailRegex,
      coursecode: examiner.coursecode
    });
    const evaluatedCount = await ConductExamExaminerAllotment.countDocuments({
      colid,
      examineremail: emailRegex,
      coursecode: examiner.coursecode,
      evaluationstatus: /^Evaluated$/i
    });

    const quantity = evaluatedCount > 0 ? evaluatedCount : (totalAllotted > 0 ? totalAllotted : 1);
    const totalamount = rate * quantity;
    const totalamount_words = numberToWords(totalamount);

    const ins = await getExamConfigHelper(colid);
    const userObj = await User.findOne({ email: emailRegex }).lean();

    res.json({
      success: true,
      bill: {
        billno: `BILL-EV2-${examiner._id.toString().slice(-6).toUpperCase()}`,
        billdate: examiner.updatedAt || new Date(),
        examinercode: examiner.acceptancedata?.examinercode || examiner.examinercode || `${examiner.coursecode}-EV`,
        examinername: examiner.examinername,
        email: examiner.examineremail,
        phone: userObj?.phone || examiner.acceptancedata?.working_mobile || examiner.acceptancedata?.mobile_no || "",
        designation: userObj?.designation || examiner.acceptancedata?.designation || "Evaluator",
        institute: examiner.acceptancedata?.working_institute || ins?.institutionname || ins?.insname || "University",
        institute_address: examiner.acceptancedata?.working_address || ins?.address || "",
        residential_address: examiner.acceptancedata?.residential_address || userObj?.address || "",
        exam: examiner.exam,
        examcode: examiner.examcode,
        program: examiner.program,
        programcode: examiner.programcode,
        course: examiner.course,
        coursecode: examiner.coursecode,
        academicyear: examiner.academicyear,
        semester: examiner.semester,
        nature_of_work: "Evaluation / Revaluation / Valuation of answer books",
        rate,
        quantity,
        totalamount,
        totalamount_words,
        bankdetails: examiner.bankdetails || {
          accountholdername: examiner.examinername || "",
          panno: userObj?.pan || "",
          accountno: "",
          ifsccode: "",
          bankname: "",
          branch: ""
        },
        issubmitted: true,
        status: examiner.status || "Finalized",
        institution: {
          institutionname: ins.institutionname || ins.insname || "",
          affiliatedboard: ins.affiliatedboard || "",
          address: ins.address || "",
          coename: ins.coename || "",
          coetitle: ins.coetitle || "Controller of Examinations",
          vcname: ins.vcname || "",
          vctitle: ins.vctitle || "Vice Chancellor",
          phone: ins.phone || "",
          email: ins.email || "",
          logo: ins.logo || ""
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBankDetails = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const examinerid = text(req.body.examinerid || req.body.id);
    const examineremail = text(req.body.examineremail || req.body.user);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const b = req.body.bankdetails || {};
    const bankdetails = {
      accountholdername: text(b.accountholdername),
      panno: text(b.panno),
      accountno: text(b.accountno),
      ifsccode: text(b.ifsccode),
      bankname: text(b.bankname),
      branch: text(b.branch)
    };

    let examiner = null;
    if (examinerid) {
      examiner = await ConductExamExaminer.findOneAndUpdate({ _id: examinerid, colid }, { bankdetails }, { new: true });
    }
    if (!examiner && examineremail) {
      examiner = await ConductExamExaminer.findOneAndUpdate(
        { colid, examineremail: new RegExp(`^${escapeRegex(examineremail)}$`, "i") },
        { bankdetails },
        { new: true }
      );
    }

    const allotmentFilter = { colid };
    if (examiner?.examineremail || examineremail) {
      allotmentFilter.examineremail = new RegExp(`^${escapeRegex(examiner?.examineremail || examineremail)}$`, "i");
    } else if (examinerid) {
      allotmentFilter._id = examinerid;
    }
    await ConductExamExaminerAllotment.updateMany(allotmentFilter, { $set: { bankdetails } });

    const targetEmail = examineremail || examiner?.examineremail;
    if (targetEmail && bankdetails.panno) {
      await User.findOneAndUpdate(
        { email: new RegExp(`^${escapeRegex(targetEmail)}$`, "i") },
        { pan: bankdetails.panno }
      );
    }

    res.json({ success: true, message: "Bank details saved", bankdetails });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


