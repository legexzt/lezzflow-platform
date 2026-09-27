import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Header from './components/Header.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import ShopDetail from './pages/ShopDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Orders from './pages/Orders.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireCustomer({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role && role !== 'customer') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/shop/:id" element={<RequireCustomer><ShopDetail /></RequireCustomer>} />
          <Route path="/cart" element={<RequireCustomer><Cart /></RequireCustomer>} />
          <Route path="/checkout" element={<RequireCustomer><Checkout /></RequireCustomer>} />
          <Route path="/orders" element={<RequireCustomer><Orders /></RequireCustomer>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <img
          src="/lezzflow-icon.png"
          alt=""
          className="footer-icon"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span>LezzFlow Mart — fresh from your neighbourhood kirana</span>
      </footer>
    </div>
  );
}
