import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/States.jsx';
import Login from './pages/Login.jsx';
import AccessDenied from './pages/AccessDenied.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Shops from './pages/Shops.jsx';
import Orders from './pages/Orders.jsx';
import Users from './pages/Users.jsx';
import Products from './pages/Products.jsx';
import Kyc from './pages/Kyc.jsx';
import LocalityAnalytics from './pages/LocalityAnalytics.jsx';
import SOS from './pages/SOS.jsx';
import Audit from './pages/Audit.jsx';
import Funnel from './pages/Funnel.jsx';
import Offers from './pages/Offers.jsx';
import Referrals from './pages/Referrals.jsx';

export default function App() {
  const { firebaseUser, role, loading, verifyError } = useAuth();

  if (loading) {
    return <Loading fullScreen message="Loading LezzFlow Admin…" />;
  }

  if (!firebaseUser) {
    return <Login />;
  }

  // Hard role block: no redirects — every route is protected by this gate.
  if (verifyError || role !== 'admin') {
    return <AccessDenied />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/shops" element={<Shops />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/users" element={<Users />} />
        <Route path="/products" element={<Products />} />
        <Route path="/kyc" element={<Kyc />} />
        <Route path="/analytics" element={<LocalityAnalytics />} />
        <Route path="/sos" element={<SOS />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/funnel" element={<Funnel />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/referrals" element={<Referrals />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
