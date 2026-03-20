import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // send HttpOnly cookie on every request
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Не редиректить при ошибке самого логина — иначе 401 «неверный пароль» даёт полную перезагрузку страницы.
    const url = String(err.config?.url ?? '')
    const isLoginAttempt = url.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginAttempt) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
