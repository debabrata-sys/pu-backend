/**
 * awardListCsvHelper.js
 * Converts award-list student data to a CSV string.
 */

function escapeCsv(value) {
  const str = String(value === null || value === undefined ? '' : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * @param {Array} students  - array of student objects from getAwardList
 * @param {Object} meta     - report meta from getAwardList (optional)
 * @returns {string} CSV text
 */
function generateCsv(students = [], meta = {}) {
  const lines = [];

  if (meta.institutionName) lines.push(escapeCsv(meta.institutionName));
  if (meta.reportTitle) lines.push(escapeCsv(meta.reportTitle));
  if (meta.exam) lines.push([escapeCsv('Exam'), escapeCsv(meta.exam)].join(','));
  if (meta.paperName && meta.paperCode) lines.push([escapeCsv('Subject'), escapeCsv(meta.paperCode + ' - ' + meta.paperName)].join(','));
  if (meta.valuationLabel) lines.push([escapeCsv('Valuation Type'), escapeCsv(meta.valuationLabel)].join(','));
  if (meta.maxMarks !== undefined) lines.push([escapeCsv('Max Marks'), escapeCsv(meta.maxMarks)].join(','));
  if (meta.date) lines.push([escapeCsv('Date'), escapeCsv(meta.date)].join(','));
  lines.push('');

  const headers = [
    'S.No', 'CN', 'Enrollment No', 'Student Name',
    'Marks Obtained (Figures)', 'Marks Obtained (Words)', 'Original Marks (V1)',
    'Evaluator ID', 'Evaluator Name', 'Evaluator Contact', 'Evaluator Email'
  ];
  lines.push(headers.map(escapeCsv).join(','));

  students.forEach((st, idx) => {
    const enrollFull = (st.enrollmentPrefix || '') + (st.enrollmentNumber || '');
    const row = [
      st.sn !== undefined ? st.sn : idx + 1,
      st.cn || '',
      enrollFull || st.regno || '',
      st.student || '',
      st.inFigure !== undefined ? st.inFigure : '',
      st.inWords || '',
      st.originalMarks !== undefined ? st.originalMarks : '',
      st.evaluatorid || '',
      st.evaluatorname || '',
      st.evaluatorcontact || '',
      st.evaluatoremail || ''
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  return lines.join('\r\n');
}

module.exports = { generateCsv };
