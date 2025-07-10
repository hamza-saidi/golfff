import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Campaigns from './pages/Campaigns';
import CampaignDetail from './pages/CampaignDetail';
import CampaignCreate from './pages/CampaignCreate';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import LoadingSpinner from './components/LoadingSpinner';

// Composant pour protéger les routes privées
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Composant pour rediriger les utilisateurs authentifiés
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <div className="App">
      <Routes>
        {/* Route publique - Login */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
        
        {/* Routes privées */}
        <Route 
          path="/*" 
          element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  {/* Dashboard */}
                  <Route path="/dashboard" element={<Dashboard />} />
                  
                  {/* Contacts */}
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/contacts/:id" element={<ContactDetail />} />
                  
                  {/* Campagnes */}
                  <Route path="/campaigns" element={<Campaigns />} />
                  <Route path="/campaigns/new" element={<CampaignCreate />} />
                  <Route path="/campaigns/:id" element={<CampaignDetail />} />
                  <Route path="/campaigns/:id/edit" element={<CampaignCreate />} />
                  
                  {/* Analytics */}
                  <Route path="/analytics" element={<Analytics />} />
                  
                  {/* Paramètres */}
                  <Route path="/settings" element={<Settings />} />
                  
                  {/* Redirection par défaut */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  
                  {/* 404 - Page non trouvée */}
                  <Route 
                    path="*" 
                    element={
                      <div className="min-h-screen flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                          <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                          <p className="text-lg text-gray-600 mb-8">Page non trouvée</p>
                          <a 
                            href="/dashboard" 
                            className="btn btn-primary"
                          >
                            Retour au tableau de bord
                          </a>
                        </div>
                      </div>
                    } 
                  />
                </Routes>
              </Layout>
            </PrivateRoute>
          } 
        />
      </Routes>
    </div>
  );
}

export default App;