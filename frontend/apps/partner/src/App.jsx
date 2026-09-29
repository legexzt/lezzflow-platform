import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AvailableCountProvider } from './AvailableCountContext';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import KycForm from './pages/KycForm';
import KycStatus from './pages/KycStatus';
import Login from './pages/Login';
import More from './pages/More';
import Notifications from './pages/Notifications';

function Loader() {
  return (
    <div className="screen-center">
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

function Protected({ children, requireApproved = false }) {
  const { firebaseUser, role, kycStatus, loading, signOut } = useAuth();

  if (loading) return <Loader />;
  if (!firebaseUser) return <Navigate to="/login" replace />;

  // Hard block once the role is known and wrong. No redirect here: every
  // route is protected, so a redirect would loop.
  if (role && role !== 'partner' && role !== 'admin') {
    return (
      <div className="screen-center">
        <p>This app is for delivery partners only.</p>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  if (requireApproved) {
    if (kycStatus === 'approved') return children;
    if (kycStatus === 'none') return <Navigate to="/kyc" replace />;
    return <Navigate to="/kyc/status" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/kyc"
        element={
          <Protected>
            <KycForm />
          </Protected>
        }
      />
      <Route
        path="/kyc/status"
        element={
          <Protected>
            <KycStatus />
          </Protected>
        }
      />
      <Route
        path="/"
        element={
          <Protected requireApproved>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/more"
        element={
          <Protected requireApproved>
            <More />
          </Protected>
        }
      />
      <Route
        path="/notifications"
        element={
          <Protected requireApproved>
            <Notifications />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppShell() {
  // Bottom nav only for signed-in partners with approved KYC — never on
  // the login / KYC screens.
  const { firebaseUser, kycStatus } = useAuth();
  const showNav = firebaseUser && kycStatus === 'approved';
  return (
    <AvailableCountProvider>
      <App />
      {showNav ? <BottomNav /> : null}
    </AvailableCountProvider>
  );
}

export default AppShell;
