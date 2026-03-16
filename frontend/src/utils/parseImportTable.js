const IMPORT_HEADER_MAP = {
  'фамилия': 'last_name',
  'имя': 'first_name',
  'отчество': 'middle_name',
  'специализация': 'specialization',
  'должность': 'title',
  'подразделение': 'department',
  'дата найма': 'hire_date',
  'дата увольнения': 'termination_date',
  'комментарий': 'comment',
}

export function parseImportDate(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (d) {
    const [, day, month, year] = d
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const parsed = new Date(t)
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export function parseImportTable(text, headerMap = IMPORT_HEADER_MAP) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { rows: [], error: 'Нужна строка заголовков и хотя бы одна строка данных' }
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headerLine = lines[0].split(delim).map((c) => c.trim().toLowerCase())
  const colIndex = {}
  headerLine.forEach((h, i) => {
    const key = headerMap[h]
    if (key) colIndex[key] = i
  })
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((c) => c.trim())
    const row = {
      last_name: cells[colIndex.last_name] ?? null,
      first_name: cells[colIndex.first_name] ?? null,
      middle_name: cells[colIndex.middle_name] ?? null,
      specialization: cells[colIndex.specialization] ?? null,
      title: cells[colIndex.title] ?? null,
      department: cells[colIndex.department] ?? null,
      hire_date: parseImportDate(cells[colIndex.hire_date]),
      termination_date: parseImportDate(cells[colIndex.termination_date]),
      comment: cells[colIndex.comment] ?? null,
    }
    rows.push(row)
  }
  return { rows, error: null }
}

