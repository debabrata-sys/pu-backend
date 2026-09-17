const mongoose = require("mongoose");

const conductExamReevaluationSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, required: true, trim: true },
    programcode: { type: String, required: true, trim: true },
    subject: { type: String, trim: true, default: "" },
    course: { type: String, required: true, trim: true },
    coursecode: { type: String, required: true, trim: true },
    paperid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexamquestionpaper2ds" },
    student: { type: String, required: true, trim: true },
    regno: { type: String, required: true, trim: true },
    cn: { type: String, trim: true, default: "" },
    maxmarks: { type: Number, default: 75 },
    originalmarks: { type: Number, required: true }, // M0 from V1
    originalevaluatorid: { type: String, trim: true, default: "" },
    originalevaluatorname: { type: String, trim: true, default: "" },

    // Status: Applied, UnderReval_1_2, Reval_1_2_Done, ReferredTo_3, Completed
    status: { type: String, trim: true, default: "Applied" },

    // Re-evaluator 1 (V2)
    reevaluator1: {
      evaluatorid: { type: String, trim: true, default: "" },
      name: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, default: "" },
      status: { type: String, trim: true, default: "Pending" }, // Pending, Evaluated
      marks: { type: Number, default: null },
      evaluatedAt: { type: Date },
      evaluationTimeSeconds: { type: Number, default: 0 }
    },

    // Re-evaluator 2 (V3)
    reevaluator2: {
      evaluatorid: { type: String, trim: true, default: "" },
      name: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, default: "" },
      status: { type: String, trim: true, default: "Pending" }, // Pending, Evaluated
      marks: { type: Number, default: null },
      evaluatedAt: { type: Date },
      evaluationTimeSeconds: { type: Number, default: 0 }
    },

    // Re-evaluator 3 (V4, only if diff > 20%)
    reevaluator3: {
      evaluatorid: { type: String, trim: true, default: "" },
      name: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, default: "" },
      status: { type: String, trim: true, default: "NotRequired" }, // NotRequired, Pending, Evaluated
      marks: { type: Number, default: null },
      evaluatedAt: { type: Date },
      evaluationTimeSeconds: { type: Number, default: 0 }
    },

    // Decision Calculations
    reval12Avg: { type: Number, default: null }, // (M1 + M2) / 2
    marksDifference: { type: Number, default: null }, // reval12Avg - originalmarks
    percentageChange: { type: Number, default: null }, // ((reval12Avg - originalmarks) / maxmarks) * 100
    reval123Avg: { type: Number, default: null }, // (M1 + M2 + M3) / 3 (if 3rd re-evaluator triggered)

    finalrevalmarks: { type: Number, default: null },
    finaldecision: { type: String, trim: true, default: "" }, // "NoChange_0_to_10%", "Revised_Avg12_10_to_20%", "Revised_Avg123_Over_20%"
    remarks: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamReevaluationSchema.index({ colid: 1, examcode: 1, coursecode: 1, regno: 1 }, { unique: true });

module.exports = mongoose.model("conductexamreevaluation2ds", conductExamReevaluationSchema);
