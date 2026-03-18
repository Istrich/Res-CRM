import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 300, gap: 16,
          color: 'var(--text-2)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
            Что-то пошло не так
          </div>
          <div style={{ fontSize: 13, maxWidth: 420, color: 'var(--text-3)' }}>
            {this.state.error?.message || 'Произошла неожиданная ошибка. Попробуйте обновить страницу.'}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Обновить страницу
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
