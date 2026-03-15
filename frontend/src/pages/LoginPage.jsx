import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { login } from '../api'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const mut = useMutation({
    mutationFn: () => login({ username, password }),
    onSuccess: (data) => {
      setToken(data.access_token)
      navigate('/')
    },
  })

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>Mini CRM</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Управление персоналом</div>
        </div>

        {mut.error && (
          <div className="alert alert-error">Неверный логин или пароль</div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); mut.mutate() }}>
          <div className="form-group">
            <label className="label">Логин</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="label">Пароль</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', height: 40 }}
            disabled={mut.isPending}
          >
            {mut.isPending ? <span className="spinner" /> : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
