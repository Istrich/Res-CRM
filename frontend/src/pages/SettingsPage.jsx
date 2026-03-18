import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { downloadFullBackup, restoreFullBackup } from '../api'

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SettingsPage() {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'error'|'warning', text }

  const backupMutation = useMutation({
    mutationFn: downloadFullBackup,
    onSuccess: ({ blob, filename }) => {
      setFeedback(null)
      triggerDownload(blob, filename)
    },
    onError: (err) => {
      const d = err.response?.data
      let text = 'Не удалось создать бэкап'
      if (d instanceof Blob) {
        d.text().then((t) => {
          try {
            const j = JSON.parse(t)
            setFeedback({ type: 'error', text: j.detail || text })
          } catch {
            setFeedback({ type: 'error', text })
          }
        })
        return
      }
      if (typeof d?.detail === 'string') text = d.detail
      setFeedback({ type: 'error', text })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreFullBackup,
    onSuccess: (data) => {
      setFeedback({ type: 'success', text: data?.detail || 'Готово.' })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (err) => {
      const d = err.response?.data
      const text = typeof d?.detail === 'string' ? d.detail : 'Восстановление не выполнено'
      setFeedback({ type: 'error', text })
    },
  })

  function handleRestore() {
    if (!file) {
      setFeedback({ type: 'warning', text: 'Выберите файл .dump' })
      return
    }
    const ok = window.confirm(
      'Восстановление полностью заменит текущие данные в базе. ' +
        'Все изменения после бэкапа будут потеряны. Продолжить?'
    )
    if (!ok) return
    restoreMutation.mutate(file)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Настройки</div>
          <div className="page-subtitle">
            Резервное копирование PostgreSQL — перед экспериментами с реальными данными
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`alert ${
            feedback.type === 'success'
              ? 'alert-success'
              : feedback.type === 'warning'
                ? 'alert-warning'
                : 'alert-error'
          }`}
          style={{ marginBottom: 16 }}
        >
          {feedback.text}
        </div>
      )}

      <div className="card" style={{ padding: '20px 22px' }}>
        <section>
          <div className="fw-600" style={{ fontSize: 14, marginBottom: 6 }}>
            Скачать бэкап
          </div>
          <p className="text-muted text-small" style={{ marginBottom: 14, lineHeight: 1.45 }}>
            Файл <span className="tag" style={{ margin: '0 4px' }}>.dump</span>
            (pg_dump): все таблицы CRM. Храните в надёжном месте.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={backupMutation.isPending}
            onClick={() => backupMutation.mutate()}
          >
            {backupMutation.isPending ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} /> Создание…
              </>
            ) : (
              '⬇ Скачать полный бэкап'
            )}
          </button>
        </section>

        <div className="divider" style={{ margin: '22px 0' }} />

        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-red">Опасная зона</span>
            <span className="fw-600" style={{ fontSize: 14 }}>
              Восстановить из бэкапа
            </span>
          </div>
          <p className="text-muted text-small" style={{ marginBottom: 14, lineHeight: 1.45 }}>
            Только файл, скачанный кнопкой выше. Текущая база будет заменена. После восстановления может
            потребоваться войти снова.
          </p>

          <div className="toolbar-left" style={{ marginBottom: 0, gap: 10, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dump,application/octet-stream"
              id="settings-backup-input"
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                setFeedback(null)
              }}
            />
            <label htmlFor="settings-backup-input" className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
              Выбрать файл…
            </label>
            <span className="text-muted text-small" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file ? file.name : 'Файл не выбран'}
            </span>
            <button
              type="button"
              className="btn btn-danger"
              disabled={restoreMutation.isPending || !file}
              onClick={handleRestore}
            >
              {restoreMutation.isPending ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderTopColor: 'var(--red)' }} />{' '}
                  Восстановление…
                </>
              ) : (
                'Восстановить базу'
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
