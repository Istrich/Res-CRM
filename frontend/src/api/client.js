import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,  // send HttpOnly cookie on every request
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
