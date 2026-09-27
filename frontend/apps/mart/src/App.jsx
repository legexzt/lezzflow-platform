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

export default function App() {
  const { user, role } = useAuth();

  return (
    <div className="app">
      <Header />
      {user && role && role !== 'customer' && (
        <div className="banner banner-warn">
          You are signed in with the &quot;{role}&quot; role. LezzFlow Mart is the customer app.
        </div>
      )}
      <main className="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/shop/:id" element={<RequireAuth><ShopDetail /></RequireAuth>} />
          <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <img src="/lezzflow-icon.png" alt="" className="footer-icon" />
        <span>LezzFlow Mart — fresh from your neighbourhood kirana</span>
      </footer>
    </div>
  );
}
