/**
 * Config diff utility for comparing AP snapshots.
 */

function diffSnapshots(left, right) {
  const allKeys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  const result = [];

  for (const key of allKeys) {
    const lMod = left?.[key];
    const rMod = right?.[key];
    if (!lMod && !rMod) continue;
    const label = lMod?.label || rMod?.label || key;
    const category = lMod?.category || rMod?.category || 'other';

    if (!lMod?.data && !rMod?.data) {
      result.push({ key, label, category, left: null, right: null, status: 'same' });
      continue;
    }
    if (!lMod?.data) {
      result.push(...flattenModule(key, label, category, null, rMod.data, 'right_only'));
      continue;
    }
    if (!rMod?.data) {
      result.push(...flattenModule(key, label, category, lMod.data, null, 'left_only'));
      continue;
    }

    const allFields = new Set([...Object.keys(lMod.data), ...Object.keys(rMod.data)]);
    for (const field of allFields) {
      const lv = lMod.data[field];
      const rv = rMod.data[field];
      const status = JSON.stringify(lv) === JSON.stringify(rv) ? 'same' : 'diff';
      result.push({ key: `${key}.${field}`, label: `${label} → ${field}`, category, left: lv, right: rv, status });
    }
  }
  return result;
}

function flattenModule(key, label, category, leftData, rightData, status) {
  const data = leftData || rightData;
  return Object.entries(data || {}).map(([field, value]) => ({
    key: `${key}.${field}`, label: `${label} → ${field}`, category,
    left: leftData ? leftData[field] : undefined,
    right: rightData ? rightData[field] : undefined,
    status,
  }));
}

function groupByCategory(diffResults) {
  const groups = {};
  for (const item of diffResults) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

function diffSummary(diffResults) {
  const counts = { same: 0, diff: 0, left_only: 0, right_only: 0 };
  for (const item of diffResults) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  return counts;
}

module.exports = { diffSnapshots, groupByCategory, diffSummary };