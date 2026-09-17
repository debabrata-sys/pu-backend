const path = require("path");
const fs = require("fs");
const multer = require("multer");
const AWS = require("aws-sdk");
const Awsconfig = require("../Models/awsconfig");
const ConductExamRoll = require("../Models/conductexamrollds");
const ConductExamAnswerBook = require("../Models/conductexamanswerbook2ds");
const ConductExamExaminerAllotment = require("../Models/conductexamexaminerallotment2ds");

// Multer in-memory storage for handling file streams
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

exports.uploadSingleMiddleware = upload.single("file");
exports.uploadMultipleMiddleware = upload.array("files", 100);

const text = (value) => String(value || "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};
const colNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniq = (values = []) => [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

// Local storage directory
const LOCAL_UPLOAD_DIR = path.join(__dirname, "../uploads/answerbooks");
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
  try {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.warn("Failed to create LOCAL_UPLOAD_DIR:", e.message);
  }
}

async function getDefaultAwsConfig(colid) {
  try {
    return (
      (await Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()) ||
      (await Awsconfig.findOne({ colid: Number(colid), type: /^aws$/i }).sort({ _id: -1 }).lean())
    );
  } catch (err) {
    return null;
  }
}

// Upload buffer to S3 or fallback to local disk
async function saveFileBuffer({ colid, buffer, originalname, mimetype }) {
  const cleanName = path.basename(originalname || "answer_book.pdf").replace(/[^\w.\-() ]/g, "_");
  const uniqueName = `${Date.now()}-${cleanName}`;

  // 1. Try S3 if credentials exist
  try {
    const config = await getDefaultAwsConfig(colid);
    const accessKeyId = config?.username || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = config?.password || process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = config?.bucket || "campustech1";
    const region = config?.region || "us-east-2";

    if (accessKeyId && secretAccessKey && bucket) {
      const key = `${Number(colid)}/evaluator2_answerbooks/${uniqueName}`;
      const s3 = new AWS.S3({ accessKeyId, secretAccessKey, region });
      await s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype || "application/pdf"
      }).promise();

      return {
        url: s3Url(bucket, region, key),
        filename: cleanName,
        key,
        filesize: buffer.length,
        mimetype: mimetype || "application/pdf"
      };
    }
  } catch (s3Err) {
    console.warn("S3 upload failed, using local storage fallback:", s3Err.message);
  }

  // 2. Fallback to local storage
  const localFilePath = path.join(LOCAL_UPLOAD_DIR, uniqueName);
  await fs.promises.writeFile(localFilePath, buffer);
  const localUrl = `/api/v2/conductexam2/answerbook-file/${encodeURIComponent(uniqueName)}`;

  return {
    url: localUrl,
    filename: cleanName,
    key: uniqueName,
    filesize: buffer.length,
    mimetype: mimetype || "application/pdf"
  };
}

// 1. Get Dropdown Options from ConductExamRoll
exports.getOptions = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    // Fetch attended rolls first, fallback to all rolls for this college
    let rolls = await ConductExamRoll.find({ colid, attended: "Yes" }).sort({ academicyear: -1, exam: 1, course: 1 }).lean();
    if (!rolls.length) {
      rolls = await ConductExamRoll.find({ colid }).sort({ academicyear: -1, exam: 1, course: 1 }).lean();
    }

    const academicyears = uniq(rolls.map((r) => r.academicyear));
    const exams = uniq(rolls.map((r) => `${r.examcode}||${r.exam}`)).map((val) => {
      const [examcode, exam] = val.split("||");
      return { examcode, exam };
    });
    const regulations = uniq(rolls.map((r) => r.regulation));
    const programs = uniq(rolls.map((r) => `${r.programcode}||${r.program}`)).map((val) => {
      const [programcode, program] = val.split("||");
      return { programcode, program };
    });
    const courses = uniq(rolls.map((r) => `${r.coursecode}||${r.course}`)).map((val) => {
      const [coursecode, course] = val.split("||");
      return { coursecode, course };
    });
    const examdates = uniq(rolls.map((r) => r.examdate));
    const slots = uniq(rolls.map((r) => r.examslot));

    res.json({
      success: true,
      academicyears,
      exams,
      regulations,
      programs,
      courses,
      examdates,
      slots
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Get Attended Students with Upload Status
exports.getAttendedStudents = async (req, res) => {
  try {
    const colid = colNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid, attended: "Yes" };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.examcode)) query.examcode = text(req.query.examcode);
    if (text(req.query.regulation)) query.regulation = text(req.query.regulation);
    if (text(req.query.programcode)) query.programcode = text(req.query.programcode);
    if (text(req.query.coursecode)) query.coursecode = text(req.query.coursecode);
    if (text(req.query.examdate)) query.examdate = text(req.query.examdate);
    if (text(req.query.examslot)) query.examslot = text(req.query.examslot);

    const rolls = await ConductExamRoll.find(query).sort({ regno: 1, student: 1 }).lean();

    // Query existing uploaded answer books
    const answerBookFilter = { colid };
    if (query.examcode) answerBookFilter.examcode = query.examcode;
    if (query.coursecode) answerBookFilter.coursecode = query.coursecode;
    const answerBooks = await ConductExamAnswerBook.find(answerBookFilter).lean();

    const bookMap = new Map();
    answerBooks.forEach((book) => {
      const key = `${book.examcode}_${book.coursecode}_${book.regno}`;
      bookMap.set(key, book);
    });

    const students = rolls.map((roll) => {
      const key = `${roll.examcode}_${roll.coursecode}_${roll.regno}`;
      const book = bookMap.get(key) || null;
      const answerbookurl = book?.answerbookurl || roll.answerbookurl || "";
      const answerbookfilename = book?.answerbookfilename || roll.answerbookfilename || "";
      const uploadstatus = answerbookurl ? (book?.uploadstatus || "Uploaded") : "Pending";

      return {
        _id: roll._id,
        rollid: roll._id,
        answerbookid: book?._id || null,
        colid: roll.colid,
        academicyear: roll.academicyear,
        regulation: roll.regulation,
        exam: roll.exam,
        examcode: roll.examcode,
        program: roll.program,
        programcode: roll.programcode,
        type: roll.type,
        subject: roll.subject,
        semester: roll.semester,
        course: roll.course,
        coursecode: roll.coursecode,
        student: roll.student,
        regno: roll.regno,
        seatno: roll.seatno,
        examdate: roll.examdate,
        examslot: roll.examslot,
        examroom: roll.examroom,
        campus: roll.campus,
        building: roll.building,
        attended: roll.attended || "Yes",
        cn: book?.cn || roll.cn || "",
        answerbookurl,
        answerbookfilename,
        filesize: book?.filesize || 0,
        mimetype: book?.mimetype || "",
        uploadstatus,
        uploaddate: book?.uploaddate || null,
        user: book?.user || roll.user || ""
      };
    });

    const totalAttended = students.length;
    const totalUploaded = students.filter((s) => s.uploadstatus === "Uploaded" || s.uploadstatus === "Verified").length;
    const totalPending = totalAttended - totalUploaded;

    res.json({
      success: true,
      data: students,
      stats: { totalAttended, totalUploaded, totalPending }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. Upload Answer Book (Single Student)
exports.uploadAnswerBook = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid || req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const regno = text(req.body.regno);
    const examcode = text(req.body.examcode);
    const coursecode = text(req.body.coursecode);
    if (!regno || !examcode || !coursecode) {
      return res.status(400).json({ success: false, message: "regno, examcode and coursecode are required" });
    }

    let fileData = null;
    if (req.file) {
      fileData = await saveFileBuffer({
        colid,
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype
      });
    } else if (req.body.answerbookurl) {
      fileData = {
        url: text(req.body.answerbookurl),
        filename: text(req.body.answerbookfilename || path.basename(req.body.answerbookurl)),
        key: "",
        filesize: number(req.body.filesize, 0),
        mimetype: text(req.body.mimetype || "application/pdf")
      };
    } else {
      return res.status(400).json({ success: false, message: "No answer book file or URL provided" });
    }

    let pagescount = 0;
    if (req.file && req.file.buffer) {
      try {
        const pdfParse = require("pdf-parse");
        const parsedPdf = await pdfParse(req.file.buffer);
        pagescount = parsedPdf.numpages || 0;
      } catch (e) {}
    } else if (number(req.body.pagescount, 0) > 0) {
      pagescount = number(req.body.pagescount, 0);
    }

    const payload = {
      colid,
      academicyear: text(req.body.academicyear),
      regulation: text(req.body.regulation),
      exam: text(req.body.exam),
      examcode,
      program: text(req.body.program),
      programcode: text(req.body.programcode),
      type: text(req.body.type),
      subject: text(req.body.subject),
      semester: text(req.body.semester),
      course: text(req.body.course),
      coursecode,
      student: text(req.body.student),
      regno,
      cn: text(req.body.cn),
      seatno: text(req.body.seatno),
      examdate: text(req.body.examdate),
      examslot: text(req.body.examslot),
      examroom: text(req.body.examroom),
      campus: text(req.body.campus),
      building: text(req.body.building),
      answerbookurl: fileData.url,
      answerbookfilename: fileData.filename,
      answerbookkey: fileData.key,
      filesize: fileData.filesize,
      mimetype: fileData.mimetype,
      pagescount,
      uploadstatus: "Uploaded",
      uploaddate: new Date(),
      user: text(req.body.user || req.query.user)
    };

    const answerBook = await ConductExamAnswerBook.findOneAndUpdate(
      { colid, examcode, coursecode, regno },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Also update ConductExamRoll for convenience
    await ConductExamRoll.updateOne(
      { colid, examcode, coursecode, regno },
      { $set: { answerbookurl: fileData.url, answerbookfilename: fileData.filename, cn: text(req.body.cn) } }
    );

    // Also update ConductExamExaminerAllotment
    await ConductExamExaminerAllotment.updateMany(
      { colid, coursecode, regno },
      { $set: { answerbookurl: fileData.url, answerbookfilename: fileData.filename, cn: text(req.body.cn) } }
    );

    res.json({
      success: true,
      message: "Answer book uploaded successfully",
      data: answerBook
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3.1 Save / Update CN (Unique Control / Copy Number)
exports.saveAnswerBookCn = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid || req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const regno = text(req.body.regno);
    const coursecode = text(req.body.coursecode);
    const cn = text(req.body.cn);
    if (!regno) return res.status(400).json({ success: false, message: "regno is required" });

    const filter = { colid, regno };
    if (coursecode) filter.coursecode = coursecode;

    await Promise.all([
      ConductExamAnswerBook.updateMany(filter, { $set: { cn } }),
      ConductExamRoll.updateMany(filter, { $set: { cn } }),
      ConductExamExaminerAllotment.updateMany(filter, { $set: { cn } })
    ]);

    res.json({ success: true, message: "CN updated successfully", cn });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. Bulk Upload Answer Books (Matching files by regno)
exports.bulkUploadAnswerBooks = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid || req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const examcode = text(req.body.examcode);
    const coursecode = text(req.body.coursecode);
    if (!examcode || !coursecode) {
      return res.status(400).json({ success: false, message: "examcode and coursecode are required for bulk upload" });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    // Load attended students for this course/exam
    const attendedRolls = await ConductExamRoll.find({
      colid,
      examcode,
      coursecode,
      attended: "Yes"
    }).lean();

    if (!attendedRolls.length) {
      return res.status(400).json({ success: false, message: "No attended students found for this exam and course." });
    }

    const matchedResults = [];
    const unmatchedFiles = [];
    const errors = [];

    for (const file of files) {
      const originalname = file.originalname;
      const base = path.parse(originalname).name.trim();

      // Find matching student where student.regno is contained in filename or exact match
      const matchedRoll = attendedRolls.find((roll) => {
        const cleanReg = text(roll.regno).toLowerCase();
        const cleanBase = base.toLowerCase();
        return cleanBase === cleanReg || cleanBase.includes(cleanReg) || cleanReg.includes(cleanBase);
      });

      if (!matchedRoll) {
        unmatchedFiles.push({ filename: originalname, reason: "No attended student matching reg no found in filename" });
        continue;
      }

      try {
        const fileData = await saveFileBuffer({
          colid,
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype
        });

        const payload = {
          colid,
          academicyear: matchedRoll.academicyear,
          regulation: matchedRoll.regulation,
          exam: matchedRoll.exam,
          examcode: matchedRoll.examcode,
          program: matchedRoll.program,
          programcode: matchedRoll.programcode,
          type: matchedRoll.type,
          subject: matchedRoll.subject,
          semester: matchedRoll.semester,
          course: matchedRoll.course,
          coursecode: matchedRoll.coursecode,
          student: matchedRoll.student,
          regno: matchedRoll.regno,
          seatno: matchedRoll.seatno,
          examdate: matchedRoll.examdate,
          examslot: matchedRoll.examslot,
          examroom: matchedRoll.examroom,
          campus: matchedRoll.campus,
          building: matchedRoll.building,
          answerbookurl: fileData.url,
          answerbookfilename: fileData.filename,
          answerbookkey: fileData.key,
          filesize: fileData.filesize,
          mimetype: fileData.mimetype,
          uploadstatus: "Uploaded",
          uploaddate: new Date(),
          user: text(req.body.user || req.query.user)
        };

        await ConductExamAnswerBook.findOneAndUpdate(
          { colid, examcode, coursecode, regno: matchedRoll.regno },
          { $set: payload },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await ConductExamRoll.updateOne(
          { colid, examcode, coursecode, regno: matchedRoll.regno },
          { $set: { answerbookurl: fileData.url, answerbookfilename: fileData.filename } }
        );

        matchedResults.push({
          regno: matchedRoll.regno,
          student: matchedRoll.student,
          filename: originalname,
          url: fileData.url
        });
      } catch (uploadErr) {
        errors.push({ filename: originalname, regno: matchedRoll.regno, error: uploadErr.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${files.length} file(s). Matched & uploaded: ${matchedResults.length}. Unmatched: ${unmatchedFiles.length}.`,
      totalFiles: files.length,
      matchedCount: matchedResults.length,
      matchedResults,
      unmatchedFiles,
      errors
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 5. Delete Answer Book
exports.deleteAnswerBook = async (req, res) => {
  try {
    const colid = colNumber(req.body.colid);
    const examcode = text(req.body.examcode);
    const coursecode = text(req.body.coursecode);
    const regno = text(req.body.regno);

    if (colid === undefined || !examcode || !coursecode || !regno) {
      return res.status(400).json({ success: false, message: "colid, examcode, coursecode and regno are required" });
    }

    await ConductExamAnswerBook.deleteOne({ colid, examcode, coursecode, regno });
    await ConductExamRoll.updateOne(
      { colid, examcode, coursecode, regno },
      { $unset: { answerbookurl: "", answerbookfilename: "" } }
    );

    res.json({ success: true, message: "Answer book deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 6. Serve local answer book file if stored locally
exports.serveAnswerBook = (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(LOCAL_UPLOAD_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send("Error serving file: " + err.message);
  }
};

// 7. Proxy PDF for cross-origin viewing with PDF.js
exports.proxyPdf = (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("url query param required");

    if (!/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).send("Invalid target URL protocol");
    }

    const httpModule = targetUrl.startsWith("https") ? require("https") : require("http");
    httpModule.get(targetUrl, (stream) => {
      if (stream.statusCode >= 300 && stream.statusCode < 400 && stream.headers.location) {
        const nextModule = stream.headers.location.startsWith("https") ? require("https") : require("http");
        return nextModule.get(stream.headers.location, (redirStream) => {
          res.setHeader("Content-Type", redirStream.headers["content-type"] || "application/pdf");
          res.setHeader("Access-Control-Allow-Origin", "*");
          redirStream.pipe(res);
        }).on("error", (e) => res.status(500).send("Stream redirect error: " + e.message));
      }
      res.setHeader("Content-Type", stream.headers["content-type"] || "application/pdf");
      res.setHeader("Access-Control-Allow-Origin", "*");
      stream.pipe(res);
    }).on("error", (err) => {
      res.status(500).send("Error streaming PDF: " + err.message);
    });
  } catch (err) {
    res.status(500).send("Proxy error: " + err.message);
  }
};
