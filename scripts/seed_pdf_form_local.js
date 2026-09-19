const mongoose = require("mongoose");
const path = require("path");

// Local DB connection ONLY
const LOCAL_DB_URI = "mongodb://127.0.0.1:27017/ep3";

async function seedData() {
  console.log("Connecting to LOCAL DB:", LOCAL_DB_URI);
  await mongoose.connect(LOCAL_DB_URI);
  console.log("Connected to Local MongoDB successfully!");

  const UserCustomField = require("../Models/usercustomfieldds");
  const EvaluatorRegistrationForm = require("../Models/evaluatorregistrationformds");

  const colid = 1;

  // -------------------------------------------------------------
  // 1. Custom Fields Definition
  // -------------------------------------------------------------
  const customFieldsToSeed = [
    {
      colid,
      fieldname: "faculty_type",
      label: "Faculty Type",
      type: "select",
      options: [
        "Engineering",
        "Law",
        "Huminites",
        "CSRD",
        "Science",
        "B.Sc. Biotech",
        "M.Sc. Biotech",
        "Medicine",
        "Dentistry",
        "Nursing",
        "Management",
        "Hotel Management",
        "pharmacy",
        "Para Medical",
        "Other"
      ],
      section: "Registration Form",
      isrequired: "Yes",
      isactive: "Yes",
      order: 1
    },
    {
      colid,
      fieldname: "valuator_type",
      label: "Valuator Type",
      type: "select",
      options: ["Internal", "External"],
      section: "Registration Form",
      isrequired: "Yes",
      isactive: "Yes",
      order: 2
    },
    {
      colid,
      fieldname: "confirm_email",
      label: "Confirm Email Id",
      type: "email",
      section: "Contact Information",
      isrequired: "Yes",
      isactive: "Yes",
      order: 3
    },
    {
      colid,
      fieldname: "confirm_phone",
      label: "Confirm Mobile Number",
      type: "text",
      section: "Contact Information",
      isrequired: "Yes",
      isactive: "Yes",
      order: 4
    },
    {
      colid,
      fieldname: "alternate_phone",
      label: "Alternate Mobile Number",
      type: "text",
      section: "Contact Information",
      isrequired: "Yes",
      isactive: "Yes",
      order: 5
    },
    {
      colid,
      fieldname: "teaching_exp_years",
      label: "Teaching Experience (Years)",
      type: "number",
      section: "Teaching Experience",
      isrequired: "Yes",
      isactive: "Yes",
      order: 6
    },
    {
      colid,
      fieldname: "teaching_exp_months",
      label: "Teaching Experience (Months)",
      type: "number",
      section: "Teaching Experience",
      isrequired: "Yes",
      isactive: "Yes",
      order: 7
    },
    // Current Employment
    {
      colid,
      fieldname: "current_designation",
      label: "Designation",
      type: "text",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 8
    },
    {
      colid,
      fieldname: "current_institution",
      label: "Institution",
      type: "text",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 9
    },
    {
      colid,
      fieldname: "current_doj",
      label: "Date of Joining",
      type: "date",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 10
    },
    {
      colid,
      fieldname: "current_doe",
      label: "Date of Exit (till date)",
      type: "text",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 11
    },
    {
      colid,
      fieldname: "current_council_id",
      label: "Medical/Dental Council ID",
      type: "text",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 12
    },
    {
      colid,
      fieldname: "current_specialization",
      label: "Specialization",
      type: "text",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 13
    },
    {
      colid,
      fieldname: "current_subjects_taught",
      label: "Subject(s) Taught",
      type: "text",
      section: "Current Employment",
      isrequired: "Yes",
      isactive: "Yes",
      order: 14
    },
    // Past Employment (If any)
    {
      colid,
      fieldname: "past_designation",
      label: "Designation",
      type: "text",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 15
    },
    {
      colid,
      fieldname: "past_institution",
      label: "Institution",
      type: "text",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 16
    },
    {
      colid,
      fieldname: "past_doj",
      label: "Date of Joining",
      type: "date",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 17
    },
    {
      colid,
      fieldname: "past_doe",
      label: "Date of Exit",
      type: "date",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 18
    },
    {
      colid,
      fieldname: "past_council_id",
      label: "Medical/Dental Council ID",
      type: "text",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 19
    },
    {
      colid,
      fieldname: "past_specialization",
      label: "Specialization",
      type: "text",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 20
    },
    {
      colid,
      fieldname: "past_subjects_taught",
      label: "Subject(s) Taught",
      type: "text",
      section: "Past Employment (If any)",
      isrequired: "No",
      isactive: "Yes",
      order: 21
    }
  ];

  console.log("Upserting custom fields into usercustomfieldds...");
  for (const cf of customFieldsToSeed) {
    await UserCustomField.findOneAndUpdate(
      { colid: cf.colid, fieldname: cf.fieldname },
      { $set: cf },
      { upsert: true, new: true }
    );
  }
  console.log(`Successfully synced ${customFieldsToSeed.length} custom fields!`);

  // -------------------------------------------------------------
  // 2. Evaluator Registration Form (PDF Specification)
  // -------------------------------------------------------------
  const formFields = [
    // Page 1
    {
      id: "f_faculty_type",
      fieldname: "faculty_type",
      label: "Faculty Type",
      source: "custom_field",
      type: "select",
      options: [
        "Engineering",
        "Law",
        "Huminites",
        "CSRD",
        "Science",
        "B.Sc. Biotech",
        "M.Sc. Biotech",
        "Medicine",
        "Dentistry",
        "Nursing",
        "Management",
        "Hotel Management",
        "pharmacy",
        "Para Medical",
        "Other"
      ],
      required: true,
      section: "General Information",
      order: 1
    },
    {
      id: "f_valuator_type",
      fieldname: "valuator_type",
      label: "Valuator Type",
      source: "custom_field",
      type: "select",
      options: ["Internal", "External"],
      required: true,
      section: "General Information",
      order: 2
    },
    {
      id: "f_gender",
      fieldname: "gender",
      label: "Gender",
      source: "user_model",
      type: "select",
      options: ["Male", "Female", "Other"],
      required: true,
      section: "General Information",
      order: 3
    },
    {
      id: "f_fullname",
      fieldname: "name",
      label: "Full Name",
      source: "user_model",
      type: "text",
      required: true,
      section: "General Information",
      order: 4
    },
    {
      id: "f_email",
      fieldname: "email",
      label: "Email Id",
      source: "user_model",
      type: "email",
      required: true,
      section: "Contact Information",
      order: 5
    },
    {
      id: "f_confirm_email",
      fieldname: "confirm_email",
      label: "Confirm Email Id",
      source: "custom_field",
      type: "email",
      required: true,
      section: "Contact Information",
      order: 6
    },
    {
      id: "f_mobile",
      fieldname: "phone",
      label: "Mobile Number",
      source: "user_model",
      type: "text",
      required: true,
      section: "Contact Information",
      order: 7
    },
    {
      id: "f_confirm_mobile",
      fieldname: "confirm_phone",
      label: "Confirm Mobile Number",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Contact Information",
      order: 8
    },
    {
      id: "f_alternate_mobile",
      fieldname: "alternate_phone",
      label: "Alternate Mobile Number",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Contact Information",
      order: 9
    },
    {
      id: "f_teaching_exp_years",
      fieldname: "teaching_exp_years",
      label: "Teaching Experience (Years)",
      source: "custom_field",
      type: "number",
      required: true,
      section: "Teaching Experience",
      order: 10
    },
    {
      id: "f_teaching_exp_months",
      fieldname: "teaching_exp_months",
      label: "Teaching Experience (Months)",
      source: "custom_field",
      type: "number",
      required: true,
      section: "Teaching Experience",
      order: 11
    },

    // Page 2: Faculty Employment Profile - Current Employment
    {
      id: "f_cur_designation",
      fieldname: "current_designation",
      label: "Designation",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Current Employment",
      order: 12
    },
    {
      id: "f_cur_institution",
      fieldname: "current_institution",
      label: "Institution",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Current Employment",
      order: 13
    },
    {
      id: "f_cur_doj",
      fieldname: "current_doj",
      label: "Date of Joining",
      source: "custom_field",
      type: "date",
      required: true,
      section: "Current Employment",
      order: 14
    },
    {
      id: "f_cur_doe",
      fieldname: "current_doe",
      label: "Date of Exit",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Current Employment",
      order: 15
    },
    {
      id: "f_cur_council_id",
      fieldname: "current_council_id",
      label: "Medical/Dental Council ID",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Current Employment",
      order: 16
    },
    {
      id: "f_cur_specialization",
      fieldname: "current_specialization",
      label: "Specialization",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Current Employment",
      order: 17
    },
    {
      id: "f_cur_subjects",
      fieldname: "current_subjects_taught",
      label: "Subject(s) Taught",
      source: "custom_field",
      type: "text",
      required: true,
      section: "Current Employment",
      order: 18
    },

    // Page 2: Faculty Employment Profile - Past Employment (If any)
    {
      id: "f_past_designation",
      fieldname: "past_designation",
      label: "Designation",
      source: "custom_field",
      type: "text",
      required: false,
      section: "Past Employment (If any)",
      order: 19
    },
    {
      id: "f_past_institution",
      fieldname: "past_institution",
      label: "Institution",
      source: "custom_field",
      type: "text",
      required: false,
      section: "Past Employment (If any)",
      order: 20
    },
    {
      id: "f_past_doj",
      fieldname: "past_doj",
      label: "Date of Joining",
      source: "custom_field",
      type: "date",
      required: false,
      section: "Past Employment (If any)",
      order: 21
    },
    {
      id: "f_past_doe",
      fieldname: "past_doe",
      label: "Date of Exit",
      source: "custom_field",
      type: "date",
      required: false,
      section: "Past Employment (If any)",
      order: 22
    },
    {
      id: "f_past_council_id",
      fieldname: "past_council_id",
      label: "Medical/Dental Council ID",
      source: "custom_field",
      type: "text",
      required: false,
      section: "Past Employment (If any)",
      order: 23
    },
    {
      id: "f_past_specialization",
      fieldname: "past_specialization",
      label: "Specialization",
      source: "custom_field",
      type: "text",
      required: false,
      section: "Past Employment (If any)",
      order: 24
    },
    {
      id: "f_past_subjects",
      fieldname: "past_subjects_taught",
      label: "Subject(s) Taught",
      source: "custom_field",
      type: "text",
      required: false,
      section: "Past Employment (If any)",
      order: 25
    }
  ];

  const formPayload = {
    colid,
    title: "Registration Form",
    description: "Faculty & Valuator Online Registration Portal",
    token: "faculty-valuator-registration-2026",
    role: "Faculty",
    department: "Academic",
    includeBankDetails: true,
    includeSignature: true,
    includePhoto: true,
    status: "Active",
    createdby: "admin",
    createdname: "Administrator",
    fields: formFields
  };

  console.log("Upserting Registration Form into evaluatorregistrationformds...");
  const formDoc = await EvaluatorRegistrationForm.findOneAndUpdate(
    { colid, token: formPayload.token },
    { $set: formPayload },
    { upsert: true, new: true }
  );

  console.log("\n========================================================");
  console.log("SUCCESS! Registration Form Configured in Local MongoDB:");
  console.log("Form ID:", formDoc._id);
  console.log("Title:", formDoc.title);
  console.log("Token:", formDoc.token);
  console.log("Colid:", formDoc.colid);
  console.log("Total Fields:", formDoc.fields.length);
  console.log("Include Bank Details:", formDoc.includeBankDetails);
  console.log("Include Signature:", formDoc.includeSignature);
  console.log("Include Photo:", formDoc.includePhoto);
  console.log(`Public URL: http://localhost:3000/evaluator-registration?colid=${colid}&token=${formDoc.token}`);
  console.log("========================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

seedData().catch((err) => {
  console.error("Error seeding local data:", err);
  process.exit(1);
});
