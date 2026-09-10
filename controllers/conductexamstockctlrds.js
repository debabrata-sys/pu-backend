const ConductExamStockInstitute = require("../Models/conductexamstockinstituteds");
const ConductExamStockHos = require("../Models/conductexamstockhosds");
const ConductExamStockEntry = require("../Models/conductexamstockentryds");
const ConductExamStockTransaction = require("../Models/conductexamstocktransactionds");
const Institution = require("../Models/insdetails");
const { getExamConfigHelper } = require("./conductexamconfigurationctlrds");

const number = (val, fallback = 0) => {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
};

const text = (val) => (val === undefined || val === null ? "" : String(val).trim());

const getInstitution = async (colid) => {
  return await getExamConfigHelper(colid);
};

// ==========================================
// 1. INSTITUTES CRUD
// ==========================================
exports.getInstitutes = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const list = await ConductExamStockInstitute.find({ colid }).sort({ institutename: 1 }).lean();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveInstitute = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body._id || req.body.id;
    const institutename = text(req.body.institutename);
    const institutecode = text(req.body.institutecode);

    if (!colid || !institutename || !institutecode) {
      return res.status(400).json({ success: false, message: "colid, institutename, and institutecode are required" });
    }

    const payload = {
      colid,
      institutename,
      institutecode: institutecode.toUpperCase(),
      description: text(req.body.description),
      status: req.body.status || "Active",
      user: text(req.body.user)
    };

    let doc;
    if (id) {
      doc = await ConductExamStockInstitute.findOneAndUpdate({ _id: id, colid }, { $set: payload }, { new: true });
    } else {
      const existing = await ConductExamStockInstitute.findOne({ colid, institutecode: payload.institutecode });
      if (existing) {
        return res.status(400).json({ success: false, message: `Institute code "${payload.institutecode}" already exists.` });
      }
      doc = await ConductExamStockInstitute.create(payload);
    }

    res.json({ success: true, message: "Institute saved successfully", data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteInstitute = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body.id || req.body._id;
    if (!colid || !id) return res.status(400).json({ success: false, message: "colid and id are required" });

    await ConductExamStockInstitute.deleteOne({ _id: id, colid });
    res.json({ success: true, message: "Institute deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. HOS (HEAD OF SECTION / STATION) CRUD
// ==========================================
exports.getHos = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const list = await ConductExamStockHos.find({ colid }).sort({ hosname: 1 }).lean();
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveHos = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body._id || req.body.id;
    const hosname = text(req.body.hosname);
    const hoscode = text(req.body.hoscode);

    if (!colid || !hosname || !hoscode) {
      return res.status(400).json({ success: false, message: "colid, hosname, and hoscode are required" });
    }

    const payload = {
      colid,
      hosname,
      hoscode: hoscode.toUpperCase(),
      department: text(req.body.department),
      status: req.body.status || "Active",
      user: text(req.body.user)
    };

    let doc;
    if (id) {
      doc = await ConductExamStockHos.findOneAndUpdate({ _id: id, colid }, { $set: payload }, { new: true });
    } else {
      const existing = await ConductExamStockHos.findOne({ colid, hoscode: payload.hoscode });
      if (existing) {
        return res.status(400).json({ success: false, message: `HOS code "${payload.hoscode}" already exists.` });
      }
      doc = await ConductExamStockHos.create(payload);
    }

    res.json({ success: true, message: "HOS saved successfully", data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteHos = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body.id || req.body._id;
    if (!colid || !id) return res.status(400).json({ success: false, message: "colid and id are required" });

    await ConductExamStockHos.deleteOne({ _id: id, colid });
    res.json({ success: true, message: "HOS deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. COMBINED OPTIONS (Institutes, HOS, Items)
// ==========================================
exports.getOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const [institutes, hosList, stockItems, institution] = await Promise.all([
      ConductExamStockInstitute.find({ colid, status: "Active" }).sort({ institutename: 1 }).lean(),
      ConductExamStockHos.find({ colid, status: "Active" }).sort({ hosname: 1 }).lean(),
      ConductExamStockEntry.find({ colid }).select("itemname currentbalance totalitems issueditems receiveditems").lean(),
      getInstitution(colid)
    ]);

    // Distinct item names with their live balances
    const itemMap = new Map();
    stockItems.forEach((entry) => {
      const name = entry.itemname;
      if (!itemMap.has(name)) {
        itemMap.set(name, {
          itemname: name,
          currentbalance: entry.currentbalance,
          totalitems: entry.totalitems,
          issueditems: entry.issueditems,
          receiveditems: entry.receiveditems
        });
      } else {
        const item = itemMap.get(name);
        item.currentbalance += entry.currentbalance;
        item.totalitems += entry.totalitems;
        item.issueditems += entry.issueditems;
        item.receiveditems += entry.receiveditems;
      }
    });

    res.json({
      success: true,
      institutes,
      hosList,
      hos: hosList,
      stockItems: [...itemMap.values()],
      items: [...itemMap.keys()],
      data: {
        institutes,
        hosList,
        hos: hosList,
        stockItems: [...itemMap.values()],
        items: [...itemMap.keys()]
      },
      academicyears: ["2026-27", "2025-26", "2024-25"],
      institution
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 4. STOCK MASTER / STOCK ENTRIES
// ==========================================
exports.getStockEntries = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.itemname)) query.itemname = new RegExp(text(req.query.itemname), "i");
    if (text(req.query.institute)) query.institute = text(req.query.institute);
    if (text(req.query.hos)) query.hos = text(req.query.hos);

    const entries = await ConductExamStockEntry.find(query).sort({ createdAt: -1 }).lean();

    let totalStock = 0;
    let totalIssued = 0;
    let totalReceived = 0;
    let totalBalance = 0;

    entries.forEach((e) => {
      totalStock += number(e.totalitems);
      totalIssued += number(e.issueditems);
      totalReceived += number(e.receiveditems);
      totalBalance += number(e.currentbalance);
    });

    res.json({
      success: true,
      data: entries,
      totals: {
        totalStock,
        totalIssued,
        totalReceived,
        totalBalance,
        count: entries.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveStockEntry = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body._id || req.body.id;
    const itemname = text(req.body.itemname);
    const totalitems = number(req.body.totalitems);

    if (!colid || !itemname || totalitems <= 0) {
      return res.status(400).json({ success: false, message: "colid, itemname, and totalitems (> 0) are required" });
    }

    const payload = {
      colid,
      academicyear: text(req.body.academicyear) || "2026-27",
      itemname,
      srno_from: text(req.body.srno_from),
      srno_to: text(req.body.srno_to),
      totalitems,
      institute: text(req.body.institute),
      hos: text(req.body.hos),
      entrydate: text(req.body.entrydate) || new Date().toISOString().slice(0, 10),
      remarks: text(req.body.remarks),
      user: text(req.body.user)
    };

    let doc;
    if (id) {
      const existing = await ConductExamStockEntry.findOne({ _id: id, colid });
      if (!existing) return res.status(404).json({ success: false, message: "Stock entry not found" });

      payload.issueditems = existing.issueditems || 0;
      payload.receiveditems = existing.receiveditems || 0;
      payload.currentbalance = payload.totalitems - payload.issueditems + payload.receiveditems;

      doc = await ConductExamStockEntry.findOneAndUpdate({ _id: id, colid }, { $set: payload }, { new: true });
    } else {
      payload.issueditems = 0;
      payload.receiveditems = 0;
      payload.currentbalance = payload.totalitems;
      doc = await ConductExamStockEntry.create(payload);
    }

    res.json({ success: true, message: "Stock entry saved successfully", data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteStockEntry = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body.id || req.body._id;
    if (!colid || !id) return res.status(400).json({ success: false, message: "colid and id are required" });

    const entry = await ConductExamStockEntry.findOne({ _id: id, colid });
    if (!entry) return res.status(404).json({ success: false, message: "Stock entry not found" });

    if (entry.issueditems > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete stock entry. ${entry.issueditems} items have already been issued from this stock batch.`
      });
    }

    await ConductExamStockEntry.deleteOne({ _id: id, colid });
    res.json({ success: true, message: "Stock entry deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 5. ISSUE / RECEIVE STOCK TRANSACTIONS
// ==========================================
exports.getTransactions = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });

    const query = { colid };
    if (text(req.query.academicyear)) query.academicyear = text(req.query.academicyear);
    if (text(req.query.type)) query.type = text(req.query.type).toUpperCase();
    if (text(req.query.itemname)) query.itemname = text(req.query.itemname);
    if (text(req.query.institute)) query.institute = text(req.query.institute);
    if (text(req.query.hos)) query.hos = text(req.query.hos);
    if (text(req.query.date)) {
      query.date = text(req.query.date);
    } else if (text(req.query.from_date) || text(req.query.to_date)) {
      query.date = {};
      if (text(req.query.from_date)) query.date.$gte = text(req.query.from_date);
      if (text(req.query.to_date)) query.date.$lte = text(req.query.to_date);
    }

    const transactions = await ConductExamStockTransaction.find(query).sort({ date: -1, createdAt: -1 }).lean();

    let grandTotal = 0;
    let totalIssued = 0;
    let totalReceived = 0;

    transactions.forEach((tx) => {
      const count = number(tx.totalitems);
      grandTotal += count;
      if (tx.type === "ISSUE") totalIssued += count;
      else if (tx.type === "RECEIVE") totalReceived += count;
    });

    const institution = await getInstitution(colid);

    res.json({
      success: true,
      data: transactions,
      totals: {
        grandTotal,
        totalIssued,
        totalReceived,
        count: transactions.length
      },
      institution
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveTransaction = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const itemname = text(req.body.itemname);
    const type = text(req.body.type).toUpperCase();
    const totalitems = number(req.body.totalitems);
    const institute = text(req.body.institute);
    const hos = text(req.body.hos);
    const date = text(req.body.date) || new Date().toISOString().slice(0, 10);
    const towhom = text(req.body.towhom);
    const srno_from = text(req.body.srno_from);
    const srno_to = text(req.body.srno_to);
    const remarks = text(req.body.remarks);
    const user = text(req.body.user);
    const academicyear = text(req.body.academicyear) || "2026-27";

    if (!colid || !itemname || !type || totalitems <= 0) {
      return res.status(400).json({ success: false, message: "colid, itemname, type (ISSUE/RECEIVE), and totalitems (> 0) are required" });
    }

    if (!["ISSUE", "RECEIVE"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be either 'ISSUE' or 'RECEIVE'" });
    }

    // Locate stock entry for this item in this college
    let stockEntry = await ConductExamStockEntry.findOne({ colid, itemname }).sort({ currentbalance: -1 });

    if (!stockEntry) {
      // If no stock entry exists and user is receiving items, auto-create a stock entry
      if (type === "RECEIVE") {
        stockEntry = await ConductExamStockEntry.create({
          colid,
          academicyear,
          itemname,
          srno_from,
          srno_to,
          totalitems,
          issueditems: 0,
          receiveditems: totalitems,
          currentbalance: totalitems,
          institute,
          hos,
          entrydate: date,
          remarks: `Auto-created from receive transaction: ${remarks}`,
          user
        });
      } else {
        return res.status(400).json({
          success: false,
          message: `No stock entry found for item "${itemname}". Please enter stock first before issuing.`
        });
      }
    }

    // Core Business Logic:
    // If ISSUE -> Deduct from stock. Check available balance.
    // If RECEIVE -> Add to stock.
    if (type === "ISSUE") {
      if (stockEntry.currentbalance < totalitems) {
        return res.status(400).json({
          success: false,
          message: `Cannot issue ${totalitems} units. Current available stock for "${itemname}" is only ${stockEntry.currentbalance} units.`
        });
      }
      stockEntry.issueditems += totalitems;
      stockEntry.currentbalance -= totalitems;
      await stockEntry.save();
    } else if (type === "RECEIVE") {
      stockEntry.receiveditems += totalitems;
      stockEntry.currentbalance += totalitems;
      await stockEntry.save();
    }

    // Create transaction ledger document
    const transaction = await ConductExamStockTransaction.create({
      colid,
      academicyear,
      stockentryId: stockEntry._id,
      itemname,
      type,
      institute,
      hos,
      date,
      towhom,
      srno_from,
      srno_to,
      totalitems,
      remarks,
      user
    });

    res.json({
      success: true,
      message: `Stock ${type === "ISSUE" ? "issued" : "received"} successfully! Remaining stock balance: ${stockEntry.currentbalance}`,
      data: transaction,
      currentbalance: stockEntry.currentbalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body.id || req.body._id;
    if (!colid || !id) return res.status(400).json({ success: false, message: "colid and id are required" });

    const tx = await ConductExamStockTransaction.findOne({ _id: id, colid });
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found" });

    // Rollback stock balance on stock entry
    if (tx.stockentryId) {
      const stockEntry = await ConductExamStockEntry.findOne({ _id: tx.stockentryId, colid });
      if (stockEntry) {
        if (tx.type === "ISSUE") {
          stockEntry.issueditems = Math.max(0, stockEntry.issueditems - tx.totalitems);
          stockEntry.currentbalance += tx.totalitems;
        } else if (tx.type === "RECEIVE") {
          stockEntry.receiveditems = Math.max(0, stockEntry.receiveditems - tx.totalitems);
          stockEntry.currentbalance = Math.max(0, stockEntry.currentbalance - tx.totalitems);
        }
        await stockEntry.save();
      }
    }

    await ConductExamStockTransaction.deleteOne({ _id: id, colid });
    res.json({ success: true, message: "Transaction deleted and stock balance rolled back successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
