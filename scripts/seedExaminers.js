const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const ConductExamExaminer = require('../Models/conductexamexaminerds');

const EXCEL_FILE_PATH = 'E:/conduct_exam_examiner_list_template (1).xlsx';

async function seedExaminers() {
  try {
    // Connect to MongoDB
    const DB = process.env.DATABASE2 || process.env.DB_CONNECTION || 'mongodb://127.0.0.1:27017/ep3';
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Read Excel file
    const workbook = xlsx.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Parse to JSON
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`Found ${data.length} records in Excel file.`);

    if (data.length === 0) {
      console.log('No data to process.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const row of data) {
      try {
        const examiner = new ConductExamExaminer({
          academicyear: row.academicyear ? String(row.academicyear).trim() : '',
          regulation: row.regulation ? String(row.regulation).trim() : '',
          exam: row.exam ? String(row.exam).trim() : '',
          examcode: row.examcode ? String(row.examcode).trim() : '',
          program: row.program ? String(row.program).trim() : '',
          programcode: row.programcode ? String(row.programcode).trim() : '',
          type: row.type ? String(row.type).trim() : '',
          subject: row.subject ? String(row.subject).trim() : '',
          semester: row.semester ? String(row.semester).trim() : '',
          course: row.course ? String(row.course).trim() : '',
          coursecode: row.coursecode ? String(row.coursecode).trim() : '',
          examinername: row.examinername ? String(row.examinername).trim() : '',
          examineremail: row.examineremail ? String(row.examineremail).trim() : '',
          examinercode: row.examinercode ? String(row.examinercode).trim() : '',
          
          // These fields might be required by the schema, set defaults if not in excel
          colid: process.env.COLID || "1",
        });

        await examiner.save();
        successCount++;
      } catch (err) {
        console.error(`Error saving row:`, row, err.message);
        errorCount++;
      }
    }

    console.log(`\nSeeding completed.`);
    console.log(`Successfully added: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

seedExaminers();
