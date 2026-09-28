import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import Header from './components/Header.jsx'
import BottomNav from './components/BottomNav.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import OrderAlertHost from './components/OrderAlertHost.jsx'
import { LanguageProvider } from './LanguageContext.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Shop from './pages/Shop.jsx'
import Products from './pages/Products.jsx'
import ProductForm from './pages/ProductForm.jsx'
import Orders from './pages/Orders.jsx'
import Offers from './pages/Offers.jsx'
import Advisory from './pages/Advisory.jsx'
import Money from './pages/Money.jsx'
import More from './pages/More.jsx'
import Onboarding from './pages/Onboarding.jsx'

export default function App() {
  const { firebaseUser } = useAuth()
  const location = useLocation()
  // Full-screen flow: hide header + bottom nav on login and on the onboarding wizard
  const showChrome = !!firebaseUser && location.pathname !== '/login' && location.pathname !== '/onboarding'

  return (
    <LanguageProvider>
    <OrderAlertHost>
      <div className="app-shell">
        {showChrome && <Header />}
        <main className="app-main">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
            <Route path="/products/new" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
            <Route path="/products/:id/edit" element={<ProtectedRoute><ProductForm /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
            <Route path="/advisory" element={<ProtectedRoute><Advisory /></ProtectedRoute>} />
            <Route path="/money" element={<ProtectedRoute><Money /></ProtectedRoute>} />
            <Route path="/more" element={<ProtectedRoute><More /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/settings" element={<Navigate to="/more" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {showChrome && <BottomNav />}
      </div>
    </OrderAlertHost>
    </LanguageProvider>
  )
}
