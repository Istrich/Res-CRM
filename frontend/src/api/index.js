import api from './client'

// Auth
export const login = (data) => api.post('/auth/login', data).then(r => r.data)
export const getMe = () => api.get('/auth/me').then(r => r.data)

// Employees
export const getEmployees = (params) => api.get('/employees', { params }).then(r => r.data)
export const getEmployee = (id, params) => api.get(`/employees/${id}`, { params }).then(r => r.data)
export const createEmployee = (data) => api.post('/employees', data).then(r => r.data)
export const importEmployees = (rows) => api.post('/employees/import', rows).then(r => r.data)
export const importEmployeesExcel = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/employees/import/excel', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}
export const updateEmployee = (id, data) => api.patch(`/employees/${id}`, data).then(r => r.data)
export const hireFromPosition = (id, data) => api.post(`/employees/${id}/hire`, data).then(r => r.data)
export const deleteEmployee = (id) => api.delete(`/employees/${id}`)
export const deleteAllEmployees = () => api.delete('/employees/all').then(r => r.data)

// Salary
export const getSalary = (id, year) => api.get(`/employees/${id}/salary`, { params: { year } }).then(r => r.data)
export const upsertSalary = (id, year, month, data) =>
  api.put(`/employees/${id}/salary/${year}/${month}`, data).then(r => r.data)
export const deleteSalary = (id, year, month) =>
  api.delete(`/employees/${id}/salary/${year}/${month}`)

// Projects
export const getProjects = (params) => api.get('/projects', { params }).then(r => r.data)
export const getProject = (id, params) => api.get(`/projects/${id}`, { params }).then(r => r.data)
export const getProjectMonthPlan = (id, year) =>
  api.get(`/projects/${id}/month-plan`, { params: { year } }).then(r => r.data)
export const putProjectMonthPlan = (id, year, items) =>
  api.put(`/projects/${id}/month-plan`, { items }, { params: { year } }).then(r => r.data)
export const createProject = (data) => api.post('/projects', data).then(r => r.data)
export const updateProject = (id, data) => api.patch(`/projects/${id}`, data).then(r => r.data)
export const deleteProject = (id) => api.delete(`/projects/${id}`)
export const getProjectEmployees = (id, params) => api.get(`/projects/${id}/employees`, { params }).then(r => r.data)
export const removeEmployeeFromProject = (projectId, assignmentId) =>
  api.delete(`/projects/${projectId}/employees/${assignmentId}`)
/** Payload: { assignmentId, year, month, rate } — year must be passed explicitly. */
export const setAssignmentRate = ({ assignmentId, year, month, rate }) =>
  api.put(`/assignments/${assignmentId}/rates/${year}/${month}`, { rate }).then(r => r.data)

// Budget Projects
export const getBudgetProjects = (params) => api.get('/budget-projects', { params }).then(r => r.data)
export const getBudgetProject = (id, params) => api.get(`/budget-projects/${id}`, { params }).then(r => r.data)
export const getBudgetProjectMonthPlan = (id, year) =>
  api.get(`/budget-projects/${id}/month-plan`, { params: { year } }).then(r => r.data)
export const putBudgetProjectMonthPlan = (id, year, items) =>
  api.put(`/budget-projects/${id}/month-plan`, { items }, { params: { year } }).then(r => r.data)
export const createBudgetProject = (data) => api.post('/budget-projects', data).then(r => r.data)
export const updateBudgetProject = (id, data) => api.patch(`/budget-projects/${id}`, data).then(r => r.data)
export const deleteBudgetProject = (id) => api.delete(`/budget-projects/${id}`)

// Assignments
export const createAssignment = (data) => api.post('/assignments', data).then(r => r.data)
export const updateAssignment = (id, data) => api.patch(`/assignments/${id}`, data).then(r => r.data)
export const deleteAssignment = (id) => api.delete(`/assignments/${id}`)

// Budgets
export const recalculateBudgets = (year) => api.post('/budgets/recalculate', null, { params: { year } }).then(r => r.data)
export const getLastCalculated = (year) => api.get('/budgets/last-calculated', { params: { year } }).then(r => r.data)
export const getProjectBudget = (id, year) => api.get(`/budgets/projects/${id}`, { params: { year } }).then(r => r.data)
export const getBudgetProjectBudget = (id, year) => api.get(`/budgets/budget-projects/${id}`, { params: { year } }).then(r => r.data)
export const getBudgetOverview = (year) => api.get('/budgets/overview', { params: { year } }).then(r => r.data)

// Dashboard
export const getDashboardSummary = (year) => api.get('/dashboard/summary', { params: { year } }).then(r => r.data)
export const getDashboardByProject = (year) => api.get('/dashboard/by-project', { params: { year } }).then(r => r.data)
export const getDashboardByDepartment = (year) => api.get('/dashboard/by-department', { params: { year } }).then(r => r.data)
export const getDashboardBySpec = (year) => api.get('/dashboard/by-specialization', { params: { year } }).then(r => r.data)
export const getMovements = (year) => api.get('/dashboard/movements', { params: { year } }).then(r => r.data)
export const getAvailableYears = () => api.get('/dashboard/available-years').then(r => r.data)

// Exports
export const exportEmployees = (year) => api.get('/exports/employees', { params: { year }, responseType: 'blob' }).then(r => r.data)
export const exportProjectsBudget = (year) => api.get('/exports/projects-budget', { params: { year }, responseType: 'blob' }).then(r => r.data)
export const exportBudgetProjects = (year) => api.get('/exports/budget-projects', { params: { year }, responseType: 'blob' }).then(r => r.data)
export const exportPayroll = (year) => api.get('/exports/payroll', { params: { year }, responseType: 'blob' }).then(r => r.data)
