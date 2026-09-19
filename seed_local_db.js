const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/ep3';

async function seed() {
  await mongoose.connect(LOCAL_URI);
  console.log('[Seed] Connected to local MongoDB at', LOCAL_URI);

  const db = mongoose.connection.db;

  // 1. Institution
  await db.collection('institutions').deleteMany({ colid: 1 });
  await db.collection('institutions').insertOne({
    colid: 1,
    admincolid: 1,
    institutionname: "PEOPLE'S UNIVERSITY, BHOPAL",
    institutioncode: "PU",
    name: "PEOPLE'S UNIVERSITY",
    type: "University",
    user: "admin@peoplesuniversity.edu.in",
    address: "People's Campus, Bhanpur, Bhopal - 462037 (M.P.)",
    state: "Madhya Pradesh",
    district: "Bhopal",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/3/30/People%27s_University_logo.png/220px-People%27s_University_logo.png",
    status: "Active",
    comments: "Default Local Development Institution",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log('[Seed] Added institution (PEOPLE\'S UNIVERSITY, BHOPAL)');

  // 2. Users (All account, Admin, Faculty, Student)
  const usersToSeed = [
    {
      email: 'admin@peoplesuniversity.edu.in',
      name: 'Super Administrator',
      phone: '9876543210',
      password: 'admin',
      role: 'All',
      colid: 1,
      admincolid: 1,
      regno: 'ADMIN001',
      programcode: 'ALL',
      program: 'All Programs',
      admissionyear: '2024',
      academicyear: '2024-25',
      semester: '1',
      section: 'A',
      department: 'Administration',
      designation: 'Super Administrator',
      category: 'General',
      authenticator: 'No',
      excluded: 'Yes',
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      email: 'all@test.com',
      name: 'All Role Admin',
      phone: '9876543210',
      password: 'all',
      role: 'All',
      colid: 1,
      admincolid: 1,
      regno: 'ALL001',
      programcode: 'ALL',
      program: 'All Programs',
      admissionyear: '2024',
      academicyear: '2024-25',
      semester: '1',
      section: 'A',
      department: 'Administration',
      designation: 'Administrator',
      category: 'General',
      authenticator: 'No',
      excluded: 'Yes',
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      email: 'faculty@peoplesuniversity.edu.in',
      name: 'Dr. Rajesh Sharma',
      phone: '9876543211',
      password: 'faculty',
      role: 'Faculty',
      colid: 1,
      admincolid: 1,
      regno: 'FAC001',
      programcode: 'MBBS',
      program: 'MBBS',
      admissionyear: '2020',
      academicyear: '2024-25',
      semester: 'I',
      section: 'A',
      department: 'Medical',
      designation: 'Professor & HOD',
      category: 'General',
      authenticator: 'No',
      excluded: 'No',
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      email: 'pu-001112501a@peoplesuniversity.edu.in',
      name: 'AADI JAIN',
      phone: '9876543210',
      password: 'student',
      role: 'Student',
      colid: 1,
      admincolid: 1,
      regno: 'PU-001112501A',
      rollno: 'PU001',
      programcode: 'MBBS',
      program: 'MBBS',
      admissionyear: '2024',
      academicyear: '2026-27',
      semester: 'I',
      section: 'A',
      department: 'Medical',
      designation: 'Student',
      category: 'General',
      authenticator: 'No',
      excluded: 'No',
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  for (const user of usersToSeed) {
    await db.collection('users').deleteOne({ email: user.email });
    await db.collection('users').insertOne(user);
    console.log(`[Seed] Added user: ${user.email} (${user.role}) - password: "${user.password}"`);
  }

  // 3. Exam Form Fill-Up Dates (conductexamformfillupdatesds)
  await db.collection('conductexamformfillupdatesds').deleteMany({ colid: 1, academicyear: '2026-27', programcode: 'MBBS' });
  await db.collection('conductexamformfillupdatesds').insertOne({
    colid: 1,
    academicyear: '2026-27',
    program: 'MBBS',
    programcode: 'MBBS',
    examfee: 2500,
    lastdate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
    lastdatefine1: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    lastdatefine1amount: 500,
    lastdatefine2: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    lastdatefine2amount: 1000,
    lastdatefine3: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lastdatefine3amount: 2000,
    iafillingdate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    user: 'admin@peoplesuniversity.edu.in',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log('[Seed] Added conductexamformfillupdatesds for MBBS 2026-27');

  // 4. Conduct Exam Master (conductexamds)
  await db.collection('conductexamds').deleteMany({ colid: 1, examcode: 'MBBS-PROF1-2026' });
  await db.collection('conductexamds').insertOne({
    colid: 1,
    academicyear: '2026-27',
    examname: 'Theory Examination, SEPTEMBER-2026',
    examcode: 'MBBS-PROF1-2026',
    program: 'MBBS',
    programcode: 'MBBS',
    faculty: 'Medical',
    institution: "PEOPLE'S UNIVERSITY, BHOPAL",
    department: 'Medical',
    semester: 'I',
    session: 'Odd',
    type: 'Regular',
    user: 'admin@peoplesuniversity.edu.in',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log('[Seed] Added conductexamds (MBBS-PROF1-2026)');

  // 5. Conduct Exam Form (conductexamformds)
  await db.collection('conductexamformds').deleteMany({ colid: 1, formid: 'EXAMFORM-MBBS-2026' });
  await db.collection('conductexamformds').insertOne({
    colid: 1,
    formname: 'MBBS Prof-I Examination Form 2026',
    formid: 'EXAMFORM-MBBS-2026',
    academicyear: '2026-27',
    program: 'MBBS',
    programcode: 'MBBS',
    examtype: 'Regular',
    status: 'Active',
    instructions: 'Please review all course subjects and uploaded documents before submission.',
    tabs: [
      {
        title: 'Basic Info',
        order: 1,
        fields: [
          { fieldname: 'student', label: 'Student Name', fieldtype: 'Text', required: 'Yes', order: 1 },
          { fieldname: 'regno', label: 'Registration Number', fieldtype: 'Text', required: 'Yes', order: 2 },
          { fieldname: 'program', label: 'Program', fieldtype: 'Text', required: 'Yes', order: 3 },
          { fieldname: 'semester', label: 'Semester / Year', fieldtype: 'Text', required: 'Yes', order: 4 }
        ]
      }
    ],
    documents: [
      { documenttype: 'Signature', required: 'Yes', order: 1 },
      { documenttype: 'Identity Proof', required: 'No', order: 2 }
    ],
    user: 'admin@peoplesuniversity.edu.in',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log('[Seed] Added conductexamformds (EXAMFORM-MBBS-2026)');

  console.log('[Seed] Done! All dummy accounts and seed records created successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
