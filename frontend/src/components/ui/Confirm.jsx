import Modal from './Modal'

export default function Confirm({ message, onConfirm, onCancel, loading }) {
  return (
    <Modal
      title="Подтверждение"
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Отмена</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Удалить'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-2)' }}>{message}</p>
    </Modal>
  )
}
