import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react'

const Notification = ({ type, message, onClose, duration = 5000 }) => {
  useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const styles = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-400',
      icon: <CheckCircle className="h-5 w-5 text-green-400" />,
      title: 'Success',
      text: 'text-green-700',
      titleText: 'text-green-800'
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-400',
      icon: <XCircle className="h-5 w-5 text-red-400" />,
      title: 'Error',
      text: 'text-red-700',
      titleText: 'text-red-800'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-400',
      icon: <AlertCircle className="h-5 w-5 text-yellow-400" />,
      title: 'Warning',
      text: 'text-yellow-700',
      titleText: 'text-yellow-800'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-400',
      icon: <Info className="h-5 w-5 text-blue-400" />,
      title: 'Info',
      text: 'text-blue-700',
      titleText: 'text-blue-800'
    }
  }

  const style = styles[type] || styles.info

  return (
    <div className={`${style.bg} border-l-4 ${style.border} p-4 mb-4`}>
      <div className="flex">
        <div className="flex-shrink-0">
          {style.icon}
        </div>
        <div className="ml-3 flex-1">
          {type === 'error' || type === 'warning' ? (
            <h3 className={`text-sm font-medium ${style.titleText}`}>
              {style.title}
            </h3>
          ) : null}
          <p className={`mt-1 text-sm ${style.text}`}>
            {message}
          </p>
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <button
              onClick={onClose}
              className={`inline-flex ${style.text} hover:opacity-70 transition-opacity`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Notification

