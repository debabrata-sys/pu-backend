const User = require('../Models/user');
const UserUploadedDocument = require('../Models/useruploadeddocumentds');

const clean = (val) => String(val || '').trim();
const number = (val) => Number(val || 0);
const escapeRegex = (val) => clean(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getNonStudentUsers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: 'colid is required' });

    const role = clean(req.query.role);
    const search = clean(req.query.search);
    const limit = Math.min(Math.max(number(req.query.limit) || 1000, 1), 5000);

    const filter = {
      colid,
      role: { $not: /^Student$/i }
    };

    if (role && !/^All$/i.test(role)) {
      filter.role = role;
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { regno: regex },
        { department: regex },
        { designation: regex },
        { institution: regex }
      ];
    }

    const users = await User.find(filter)
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    const emails = users.map((u) => clean(u.email).toLowerCase()).filter(Boolean);
    const userMap = new Map();
    users.forEach((u) => {
      userMap.set(clean(u.email).toLowerCase(), u);
      u.documents = [];
    });

    if (emails.length > 0) {
      const emailRegexes = emails.map((e) => new RegExp(`^${escapeRegex(e)}$`, 'i'));
      const documents = await UserUploadedDocument.find({
        colid,
        owneruser: { $in: emailRegexes }
      })
        .sort({ createdAt: -1 })
        .lean();

      documents.forEach((doc) => {
        const emailKey = clean(doc.owneruser).toLowerCase();
        const userObj = userMap.get(emailKey);
        if (userObj) {
          userObj.documents.push(doc);
        }
      });
    }

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateNonStudentUser = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const id = req.body.id || req.body._id;
    const values = req.body.values || {};

    if (!colid || !id) {
      return res.status(400).json({ success: false, message: 'colid and user id are required' });
    }

    const user = await User.findOne({
      _id: id,
      colid,
      role: { $not: /^Student$/i }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Non-student user not found' });
    }

    if (!user.customFields) {
      user.customFields = new Map();
    }

    const systemProtected = new Set(['_id', '__v', 'colid', 'role']);

    Object.entries(values).forEach(([key, val]) => {
      if (systemProtected.has(key)) return;

      if (key.startsWith('customFields.')) {
        const subKey = key.replace('customFields.', '');
        if (user.customFields instanceof Map) {
          user.customFields.set(subKey, val);
        } else {
          user.customFields[subKey] = val;
        }
      } else if (key === 'customFields' && typeof val === 'object' && val !== null) {
        Object.entries(val).forEach(([k, v]) => {
          if (user.customFields instanceof Map) {
            user.customFields.set(k, v);
          } else {
            user.customFields[k] = v;
          }
        });
      } else {
        user[key] = val;
      }
    });

    user.markModified('customFields');
    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkDeleteNonStudentUsers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];

    if (!colid || !ids.length) {
      return res.status(400).json({ success: false, message: 'colid and an array of user ids are required' });
    }

    const targetUsers = await User.find({
      _id: { $in: ids },
      colid,
      role: { $not: /^Student$/i }
    }).select('_id email').lean();

    if (!targetUsers.length) {
      return res.json({
        success: true,
        deletedCount: 0,
        message: 'No eligible non-student users found for deletion'
      });
    }

    const validIds = targetUsers.map((u) => u._id);
    const userEmails = targetUsers.map((u) => clean(u.email)).filter(Boolean);

    const deleteResult = await User.deleteMany({ _id: { $in: validIds } });

    if (userEmails.length > 0) {
      const emailRegexes = userEmails.map((e) => new RegExp(`^${escapeRegex(e)}$`, 'i'));
      await UserUploadedDocument.deleteMany({
        colid,
        owneruser: { $in: emailRegexes }
      });
    }

    res.json({
      success: true,
      deletedCount: deleteResult.deletedCount || 0,
      message: `Successfully deleted ${deleteResult.deletedCount || 0} non-student user(s)`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkUploadNonStudentUsers = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const actor = clean(req.body.user);

    if (!colid) return res.status(400).json({ success: false, message: 'colid is required' });
    if (!items.length) return res.status(400).json({ success: false, message: 'No rows received for upload' });

    const errors = [];
    let saved = 0;

    for (let index = 0; index < items.length; index += 1) {
      const row = items[index] || {};
      const rowNumber = row.rowNumber || index + 2;

      const email = clean(row.email || row.Email || row['Email ID'] || row['Google Mail'] || row.googleemail);
      if (!email) {
        errors.push(`Row ${rowNumber}: Email is required`);
        continue;
      }

      const name = clean(row.name || row.Name || row['Full Name']);
      if (!name) {
        errors.push(`Row ${rowNumber}: Name is required`);
        continue;
      }

      const role = clean(row.role || row.Role) || 'Faculty';
      if (/^student$/i.test(role)) {
        errors.push(`Row ${rowNumber}: Role 'Student' is not allowed in non-student bulk upload`);
        continue;
      }

      const phone = clean(row.phone || row.Phone || row.mobile || row.Mobile || row['Phone Number']) || '0000000000';
      const regno = clean(row.regno || row['Employee ID'] || row['Emp ID'] || row['Reg No'] || row.regNo || row.employeeId) || email.split('@')[0];
      const department = clean(row.department || row.Department) || 'General';
      const designation = clean(row.designation || row.Designation);
      const institution = clean(row.institution || row.Institution || row['College Name'] || row.college);
      const gender = clean(row.gender || row.Gender);
      const password = clean(row.password || row.Password) || 'User@123';
      const program = clean(row.program || row.Program) || '-';
      const programcode = clean(row.programcode || row['Program Code']) || '-';
      const admissionyear = clean(row.admissionyear || row['Admission Year']) || String(new Date().getFullYear());
      const semester = clean(row.semester || row.Semester) || '-';
      const section = clean(row.section || row.Section) || '-';
      const authenticator = clean(row.authenticator || 'Yes');

      const customFields = {};
      const knownKeys = new Set([
        'email', 'name', 'role', 'phone', 'regno', 'department', 'designation', 'institution',
        'gender', 'password', 'program', 'programcode', 'admissionyear', 'semester', 'section',
        'authenticator', 'rownumber', '_id', '__v', 'colid', 'customfields'
      ]);

      Object.entries(row).forEach(([key, val]) => {
        if (key.startsWith('customFields.')) {
          customFields[key.replace('customFields.', '')] = val;
        } else if (!knownKeys.has(key.toLowerCase()) && !knownKeys.has(key)) {
          customFields[key] = val;
        }
      });

      try {
        const updateDoc = {
          name,
          email: email.toLowerCase(),
          role,
          phone,
          regno,
          department,
          designation,
          institution,
          gender,
          password,
          program,
          programcode,
          admissionyear,
          semester,
          section,
          authenticator,
          user: actor || email.toLowerCase()
        };

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
          if (Number(existing.colid) !== Number(colid)) {
            errors.push(`Row ${rowNumber} (${email}): Skipped upsert because user belongs to colid ${existing.colid ?? 'none'} (mismatched colid)`);
            continue;
          }
          // Colid matches: update user attributes but never overwrite/change colid
          Object.assign(existing, updateDoc);
          if (!existing.customFields) existing.customFields = new Map();
          Object.entries(customFields).forEach(([k, v]) => {
            if (existing.customFields instanceof Map) {
              existing.customFields.set(k, v);
            } else {
              existing.customFields[k] = v;
            }
          });
          existing.markModified('customFields');
          await existing.save();
        } else {
          updateDoc.colid = colid;
          updateDoc.customFields = customFields;
          await User.create(updateDoc);
        }
        saved += 1;
      } catch (err) {
        errors.push(`Row ${rowNumber} (${email}): ${err.message}`);
      }
    }

    res.json({
      success: true,
      saved,
      errors,
      message: `Bulk upload completed. Saved/updated ${saved} user(s).`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
