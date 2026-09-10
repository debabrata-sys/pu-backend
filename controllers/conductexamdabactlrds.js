const ConductExamFormSubmission = require("../Models/conductexamformsubmissionds");
const ConductExamForm = require("../Models/conductexamformds");
const InsDetails = require("../Models/insdetails");
const Institution = require("../Models/institutions");
const Admusers = require("../Models/admusers");
const User = require("../Models/user");
const { getExamConfigHelper } = require("./conductexamconfigurationctlrds");

const clean = (v) => String(v || "").trim();
const num = (v, fallback = 0) => {
  const p = Number(v);
  return Number.isFinite(p) ? p : fallback;
};

// Fetch distinct filter options from submitted exam forms + institution details
exports.getDabaOptions = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) {
      return res.status(400).json({ status: "error", message: "College ID (colid) is required" });
    }

    // 1. Fetch institution details from exam configuration
    const ins = await getExamConfigHelper(colid);

    // 2. Fetch distinct values and combinations from submitted exam forms
    const submissions = await ConductExamFormSubmission.find({
      colid,
      status: { $in: ["Submitted", "Approved", "Active", "Verified"] }
    }).select("academicyear exam examcode program programcode semester courses status").lean();

    const comboMap = new Map();
    const academicYears = new Set();
    const examMap = new Map();
    const programMap = new Map();
    const semesters = new Set();
    const courseMap = new Map();

    submissions.forEach(s => {
      const ay = clean(s.academicyear);
      const ec = clean(s.examcode);
      const en = clean(s.exam) || ec;
      const pc = clean(s.programcode) || clean(s.program);
      const pn = clean(s.program) || pc;
      const sem = clean(s.semester);

      if (ay) academicYears.add(ay);
      if (ec && !examMap.has(ec)) examMap.set(ec, { examcode: ec, examname: en, academicyear: ay });
      if (pc && !programMap.has(pc)) programMap.set(pc, { programcode: pc, programname: pn });
      if (sem) semesters.add(sem);

      if (Array.isArray(s.courses) && s.courses.length > 0) {
        s.courses.forEach(c => {
          const cc = clean(c.coursecode);
          const cn = clean(c.course) || clean(c.subject) || cc;
          if (cc && !courseMap.has(cc)) {
            courseMap.set(cc, { coursecode: cc, coursename: cn, programcode: pc, semester: sem });
          }
          const key = `${ay}||${ec}||${en}||${pc}||${pn}||${sem}||${cc}||${cn}`;
          if (!comboMap.has(key)) {
            comboMap.set(key, {
              academicyear: ay,
              examcode: ec,
              examname: en,
              programcode: pc,
              programname: pn,
              semester: sem,
              coursecode: cc,
              coursename: cn
            });
          }
        });
      } else {
        const key = `${ay}||${ec}||${en}||${pc}||${pn}||${sem}||||`;
        if (!comboMap.has(key)) {
          comboMap.set(key, {
            academicyear: ay,
            examcode: ec,
            examname: en,
            programcode: pc,
            programname: pn,
            semester: sem,
            coursecode: "",
            coursename: ""
          });
        }
      }
    });

    const combinations = Array.from(comboMap.values());

    return res.json({
      status: "success",
      institution: ins || {
        institutionname: "PEOPLE'S UNIVERSITY, BHOPAL",
        logolink: "",
        address: "Bhopal, Madhya Pradesh"
      },
      combinations,
      academicyears: Array.from(academicYears).sort(),
      exams: Array.from(examMap.values()),
      programs: Array.from(programMap.values()),
      semesters: Array.from(semesters).sort(),
      courses: Array.from(courseMap.values())
    });
  } catch (err) {
    console.error("Error in getDabaOptions:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Fetch DABA report data (Examinees who submitted exam form)
exports.getDabaReport = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) {
      return res.status(400).json({ status: "error", message: "College ID (colid) is required" });
    }

    const {
      academicyear,
      examcode,
      programcode,
      coursecode,
      semester,
      centername,
      institutename,
      status: examStatus,
      specialization,
      examdate
    } = req.query;

    // Fetch institution from exam configuration
    let ins = await getExamConfigHelper(colid);

    // Build filter for submitted exam forms
    const filter = {
      colid,
      status: { $in: ["Submitted", "Approved", "Active", "Verified"] }
    };

    if (clean(academicyear)) filter.academicyear = clean(academicyear);
    if (clean(examcode)) filter.examcode = clean(examcode);
    if (clean(programcode)) filter.programcode = clean(programcode);
    if (clean(semester)) filter.semester = clean(semester);

    // If coursecode is specified, ensure candidate selected this course
    if (clean(coursecode)) {
      filter["courses.coursecode"] = clean(coursecode);
    }

    const submissions = await ConductExamFormSubmission.find(filter)
      .sort({ regno: 1, student: 1 })
      .lean();

    // Lookup real student photos from admusers for candidates where photo is missing in submission
    const regnos = submissions.map(s => clean(s.regno)).filter(Boolean);
    const emails = submissions.map(s => clean(s.email)).filter(Boolean);

    // Query both Admusers and main User (students) collection — student photo upload saves to User
    const [admUsers, studentUsers] = await Promise.all([
      Admusers.find({
        colid,
        $or: [
          { username: { $in: regnos } },
          { email: { $in: emails } }
        ]
      }).select("username email photo").lean(),
      User.find({
        colid,
        $or: [
          { regno: { $in: regnos } },
          { email: { $in: emails } }
        ]
      }).select("regno email photo").lean()
    ]);

    const userPhotoMap = new Map();
    // Add Admusers photos first (lower priority)
    admUsers.forEach(u => {
      const p = clean(u.photo);
      if (p && !/dicebear|avataaars/i.test(p)) {
        if (u.username) userPhotoMap.set(clean(u.username), p);
        if (u.email) userPhotoMap.set(clean(u.email), p);
      }
    });
    // Overwrite with User (students) photos — higher priority as this is where photo upload saves
    studentUsers.forEach(u => {
      const p = clean(u.photo);
      if (p && !/dicebear|avataaars/i.test(p)) {
        if (u.regno) userPhotoMap.set(clean(u.regno), p);
        if (u.email) userPhotoMap.set(clean(u.email), p);
      }
    });

    // Map examinee records
    const examinees = submissions.map((sub, index) => {
      // Find photo from documents or data
      let photoUrl = "";
      if (Array.isArray(sub.documents)) {
        const photoDoc = sub.documents.find(d => /photo/i.test(d.documenttype || d.description || d.filename));
        if (photoDoc && photoDoc.url) {
          photoUrl = photoDoc.url;
        }
      }
      if (!photoUrl && sub.data) {
        photoUrl = sub.data.photo || sub.data.photourl || sub.data.photoUrl || sub.data.studentphoto || "";
      }
      // Fallback to admusers photo if available
      if (!photoUrl) {
        photoUrl = userPhotoMap.get(clean(sub.regno)) || userPhotoMap.get(clean(sub.email)) || "";
      }

      // Eliminate any dummy / avatar generator URLs
      if (photoUrl && /dicebear|avataaars/i.test(photoUrl)) {
        photoUrl = "";
      }

      // Course details for this specific examinee
      const selectedCourse = Array.isArray(sub.courses)
        ? sub.courses.find(c => clean(c.coursecode) === clean(coursecode)) || sub.courses[0]
        : null;

      return {
        sno: index + 1,
        id: sub._id,
        enrollmentno: sub.regno,
        studentname: clean(sub.student).toUpperCase(),
        photo: photoUrl,
        program: sub.program || "",
        semester: sub.semester || "",
        examtype: sub.examtype || "Regular",
        selectedCourse: selectedCourse ? {
          coursecode: selectedCourse.coursecode,
          coursename: selectedCourse.course,
          subject: selectedCourse.subject
        } : null
      };
    });

    return res.json({
      status: "success",
      totalExaminees: examinees.length,
      totalPages: Math.ceil(examinees.length / 6) || 1,
      institution: {
        institutionname: ins?.institutionname || ins?.name || clean(institutename) || "PEOPLE'S UNIVERSITY, BHOPAL",
        affiliatedboard: ins?.affiliatedboard || "",
        logolink: ins?.logo || ins?.logolink || "",
        address: ins?.address || "",
        coename: ins?.coename || "",
        coetitle: ins?.coetitle || "",
        vcname: ins?.vcname || "",
        vctitle: ins?.vctitle || ""
      },
      header: {
        centername: clean(centername) || "People's College of Medical Sciences & Research Centre",
        institutename: clean(institutename) || ins?.institutionname || "People's College of Medical Science & Research Centre",
        coursename: clean(programcode) || (examinees[0]?.program) || "MBBS",
        prof: clean(semester) || "I",
        status: clean(examStatus) || "Main",
        specialization: clean(specialization) || "",
        subjectcode: clean(coursecode) || "BS-2101",
        subjectname: examinees[0]?.selectedCourse?.coursename || "Anatomy (Paper-I)",
        examdate: clean(examdate) || "08-Sep-26"
      },
      examinees
    });
  } catch (err) {
    console.error("Error in getDabaReport:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Seeder endpoint for sample DABA data matching the People's University MBBS example
exports.seedSampleDabaData = async (req, res) => {
  try {
    const colid = num(req.body.colid) || 1;

    // Seed Institution Details if not present
    const existingIns = await InsDetails.findOne({ colid });
    if (!existingIns) {
      await InsDetails.create({
        colid,
        institutionname: "PEOPLE'S UNIVERSITY, BHOPAL",
        logolink: "https://upload.wikimedia.org/wikipedia/en/thumb/3/30/People%27s_University_logo.png/220px-People%27s_University_logo.png",
        address: "People's Campus, Bhanpur, Bhopal - 462037 (M.P.)"
      });
    }

    // Sample students from the PDF
    const sampleStudents = [
      { regno: "PU-001112501A", student: "AADI JAIN" },
      { regno: "PU-002112501A", student: "AANIDHYA BORANA" },
      { regno: "PU-003112501A", student: "AASHISH KIRAR" },
      { regno: "PU-004112501A", student: "ABHISHEK SAHU" },
      { regno: "PU-005112501A", student: "ADARSH VISHWKARMA" },
      { regno: "PU-006112501A", student: "ADITI GUPTA" },
      { regno: "PU-007112501A", student: "ADITI MALVIYA" },
      { regno: "PU-008112501A", student: "ADITI NAGAR" },
      { regno: "PU-009112501A", student: "ADITI SHARMA" },
      { regno: "PU-010112501A", student: "ADITI SHARMA" },
      { regno: "PU-011112501A", student: "ADITYA AJAY" },
      { regno: "PU-012112501A", student: "ADITYA LAVALE" }
    ];

    let insertedCount = 0;
    for (const s of sampleStudents) {
      const exists = await ConductExamFormSubmission.findOne({ colid, regno: s.regno, examcode: "MBBS-PROF1-2026" });
      if (!exists) {
        await ConductExamFormSubmission.create({
          colid,
          formid: "EXAMFORM-MBBS-2026",
          formname: "MBBS Prof-I Examination Form 2026",
          academicyear: "2026-27",
          regulation: "NMC-2026",
          exam: "Theory Examination, SEPTEMBER-2026",
          examcode: "MBBS-PROF1-2026",
          examtype: "Regular",
          program: "MBBS",
          programcode: "MBBS",
          semester: "I",
          student: s.student,
          regno: s.regno,
          email: `${s.regno.toLowerCase()}@peoplesuniversity.edu.in`,
          phone: "9876543210",
          section: "A",
          courses: [
            {
              course: "Anatomy (Paper-I)",
              coursecode: "BS-2101",
              subject: "Anatomy",
              type: "Theory",
              examtype: "Regular",
              fee: 1000
            },
            {
              course: "Physiology (Paper-I)",
              coursecode: "BS-2102",
              subject: "Physiology",
              type: "Theory",
              examtype: "Regular",
              fee: 1000
            }
          ],
          documents: [
            {
              documenttype: "photo",
              description: "Candidate Photo",
              filename: `${s.regno}_photo.jpg`,
              url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(s.student)}`
            }
          ],
          status: "Submitted",
          user: "system"
        });
        insertedCount++;
      }
    }

    return res.json({
      status: "success",
      message: `Sample DABA exam form submissions ready. Inserted: ${insertedCount}, Total sample candidates: ${sampleStudents.length}`
    });
  } catch (err) {
    console.error("Error seeding sample DABA data:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
