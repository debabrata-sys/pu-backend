const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const QuestionPaperStock = require('../Models/questionpaperstockds');

const EXCEL_FILE_PATH = 'E:/CSRD_B.Sc._Biotechnology_2021.xls';

async function seedStock() {
  try {
    const DB = process.env.DATABASE2 || process.env.DB_CONNECTION || 'mongodb://127.0.0.1:27017/ep3';
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const workbook = xlsx.readFile(EXCEL_FILE_PATH);
    console.log(`Found ${workbook.SheetNames.length} sheets in Excel file.`);

    let successCount = 0;
    let errorCount = 0;

    for (const sheetName of workbook.SheetNames) {
      console.log(`Processing sheet: ${sheetName}`);
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
      
      if (data.length < 3) {
        console.log(`Sheet ${sheetName} has too few rows, skipping.`);
        continue;
      }

      // Extract Program and Semester from Row 1 (index 1)
      const metaRow = data[1] || [];
      
      let program = "";
      let semester = "";
      let scheme = "2021"; // default

      // Find Program and Semester in meta row
      for (let i = 0; i < metaRow.length; i++) {
        if (typeof metaRow[i] === 'string') {
          const val = metaRow[i].trim().toLowerCase();
          if (val === 'program' && i + 1 < metaRow.length) {
            program = metaRow[i+1];
          } else if (val === 'semester' && i + 1 < metaRow.length) {
            semester = metaRow[i+1];
          } else if (val === 'scheme' && i + 1 < metaRow.length) {
            scheme = metaRow[i+1];
          }
        }
      }

      if (!program) program = 'B.Sc. Biotechnology';
      if (!semester) semester = sheetName.replace('Sem', '').trim();

      console.log(`Program: ${program}, Semester: ${semester}, Scheme: ${scheme}`);

      // Process data rows starting from index 3
      let lastPaperCode = "";
      let lastPaperName = "";

      for (let r = 3; r < data.length; r++) {
        const row = data[r] || [];
        // if completely empty row, skip
        if (row.length === 0) continue;
        
        // S No, Paper Code, Name of Paper, Name of Paper setter, Paper Category, Address, 
        // Main Used/UnusedMonth-Year, ATKT Used/UnusedMonth-Year, Stok Month /Year, 
        // Contact Number, Submission Mode, Examiner Code, Email ID
        
        let paperCode = row[1] ? String(row[1]).trim() : lastPaperCode;
        let paperName = row[2] ? String(row[2]).trim() : lastPaperName;

        // If no paper name at all, skip
        if (!paperName) continue;

        lastPaperCode = paperCode;
        lastPaperName = paperName;

        // If this row has no paper setter, skip (it might be a completely blank trailing row)
        let paperSetterName = row[3] ? String(row[3]).trim() : "";
        if (!paperSetterName && !row[4]) continue;

        const stockEntry = new QuestionPaperStock({
          colid: process.env.COLID || "1",
          academicyear: scheme, // using scheme as academic year here
          regulation: "",
          program: program,
          programcode: "",
          semester: semester,
          papercode: paperCode,
          papername: paperName,
          papersettername: paperSetterName,
          papercategory: row[4] ? String(row[4]).trim() : "",
          address: row[5] ? String(row[5]).trim() : "",
          mainusedstatus: row[6] ? String(row[6]).trim() : "",
          atktusedstatus: row[7] ? String(row[7]).trim() : "",
          stockmonthyear: row[8] ? String(row[8]).trim() : "",
          contactnumber: row[9] ? String(row[9]).trim() : "",
          submissionmode: row[10] ? String(row[10]).trim() : "",
          examinercode: row[11] ? String(row[11]).trim() : "",
          email: row[12] ? String(row[12]).trim() : "",
        });

        try {
          await stockEntry.save();
          successCount++;
        } catch (err) {
          console.error(`Error saving row ${r} in sheet ${sheetName}:`, err.message);
          errorCount++;
        }
      }
    }

    console.log(`\nStock Seeding completed.`);
    console.log(`Successfully added: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

  } catch (err) {
    console.error('Error during stock seeding:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

seedStock();
