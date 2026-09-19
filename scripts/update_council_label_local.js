const mongoose = require("mongoose");

const LOCAL_DB_URI = "mongodb://127.0.0.1:27017/ep3";

async function run() {
  console.log("Connecting to local MongoDB...");
  await mongoose.connect(LOCAL_DB_URI);

  const UserCustomField = require("../Models/usercustomfieldds");
  const EvaluatorRegistrationForm = require("../Models/evaluatorregistrationformds");

  const newLabel = "Applicable Regulatory Bodies / Council ID";

  // 1. Update usercustomfieldds
  const cfRes = await UserCustomField.updateMany(
    {
      $or: [
        { fieldname: { $in: ["current_council_id", "past_council_id", "medical_dental_council_id", "medical_council_id", "council_id"] } },
        { label: /Medical\/Dental/i },
        { label: /Medical\/Dentistry/i }
      ]
    },
    { $set: { label: newLabel } }
  );
  console.log("Updated usercustomfieldds modifiedCount:", cfRes.modifiedCount);

  // 2. Update evaluatorregistrationformds
  const forms = await EvaluatorRegistrationForm.find({});
  for (const form of forms) {
    let modified = false;
    form.fields.forEach((f) => {
      if (
        ["current_council_id", "past_council_id", "medical_dental_council_id", "council_id"].includes(f.fieldname) ||
        (f.label && (f.label.includes("Medical/Dental") || f.label.includes("Medical/Dentistry")))
      ) {
        console.log(`Renaming field '${f.fieldname}' label from '${f.label}' to '${newLabel}'`);
        f.label = newLabel;
        modified = true;
      }
    });
    if (modified) {
      await form.save();
      console.log("Saved updated form:", form.title, "token:", form.token);
    }
  }

  await mongoose.disconnect();
  console.log("Done updating labels in local DB!");
  process.exit(0);
}

run().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
