import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'

const ProtectedRoute = ({ children, userType }) => {
  const { isAuthenticated, userType: authUserType } = useSelector((state) => state.auth)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (userType && authUserType !== userType) {
    // Redirect based on user type
    if (authUserType === 'admin') {
      return <Navigate to="/admin" replace />
    }
    if (authUserType === 'host') {
      return <Navigate to="/host" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default ProtectedRoute

