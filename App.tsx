import React, { Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import ClientDashboard from './pages/ClientDashboard';
import ApiHandlerPage from './pages/ApiHandlerPage';
import AnalyticsPage from './pages/AnalyticsPage';
import Layout from './components/Layout';
import AccountSettingsPage from './pages/AccountSettingsPage';
import TermsPage from './pages/TermsPage';
import ChatPage from './pages/ChatPage';
import MwsRevenuePage from './pages/MwsRevenuePage';
import SendNotificationPage from './pages/SendNotificationPage';
import NotificationsPage from './pages/NotificationsPage';
import ManageNotificationsPage from './pages/ManageNotificationsPage';
import { useTranslation } from 'react-i18next';

const ProtectedRoute: React.FC<{ children: React.ReactElement; role: 'admin' | 'client' }> = ({ children, role }) => {
    const { user } = useAuth();
    const location = useLocation();

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (user.role !== role) {
        const defaultPath = user.role === 'admin' ? '/admin/dashboard' : `/client/${user.id}/dashboard`;
        return <Navigate to={defaultPath} replace />;
    }

    return children;
};

const AppLayout: React.FC<{ role: 'admin' | 'client' }> = ({ role }) => (
    <ProtectedRoute role={role}>
        <Layout>
            <Outlet />
        </Layout>
    </ProtectedRoute>
);

const AppRoutes: React.FC = () => {
    const { user } = useAuth();
    
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/api/lead/:clientId" element={<ApiHandlerPage />} />
            
            <Route path="/admin" element={<AppLayout role="admin" />}>
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="revenue" element={<MwsRevenuePage />} />
                <Route path="settings" element={<AccountSettingsPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="send-notification" element={<SendNotificationPage />} />
                <Route path="manage-notifications" element={<ManageNotificationsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route index element={<Navigate to="dashboard" />} />
            </Route>

            <Route path="/client/:userId" element={<AppLayout role="client" />}>
                <Route path="dashboard" element={<ClientDashboard />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="revenue" element={<MwsRevenuePage />} />
                <Route path="settings" element={<AccountSettingsPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route index element={<Navigate to="dashboard" />} />
            </Route>
            
            <Route 
                path="/" 
                element={
                    user ? (
                        <Navigate to={user.role === 'admin' ? '/admin/dashboard' : `/client/${user.id}/dashboard`} />
                    ) : (
                        <Navigate to="/login" />
                    )
                } 
            />
        </Routes>
    );
};

const AppCore: React.FC = () => {
    const { i18n } = useTranslation();
    useEffect(() => {
        document.documentElement.lang = i18n.language;
        localStorage.setItem('language', i18n.language);
    }, [i18n.language]);

    return <AppRoutes />;
}

function App() {
    return (
        <Suspense fallback={<div className="w-screen h-screen flex items-center justify-center">Caricamento / Loading...</div>}>
            <ThemeProvider>
                <AuthProvider>
                    <HashRouter>
                        <AppCore />
                    </HashRouter>
                </AuthProvider>
            </ThemeProvider>
        </Suspense>
    );
}

export default App;