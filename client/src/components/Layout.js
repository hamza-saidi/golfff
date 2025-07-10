import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Mail, 
  BarChart3, 
  Settings, 
  LogOut, 
  Menu,
  X,
  User
} from 'lucide-react';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Contacts', href: '/contacts', icon: Users },
    { name: 'Campagnes', href: '/campaigns', icon: Mail },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Paramètres', href: '/settings', icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-gray-800">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
            <SidebarContent navigation={navigation} location={location} onLogout={handleLogout} user={user} />
          </div>
        </div>
      )}

      {/* Sidebar desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <SidebarContent navigation={navigation} location={location} onLogout={handleLogout} user={user} />
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Header */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <button
            type="button"
            className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex">
              {/* Espace pour recherche ou breadcrumb si nécessaire */}
            </div>
            <div className="ml-4 flex items-center md:ml-6">
              <div className="ml-3 relative">
                <div className="flex items-center text-sm text-gray-700">
                  <User className="h-5 w-5 mr-2" />
                  <span>{user?.first_name} {user?.last_name}</span>
                  <span className="ml-2 text-xs bg-primary-100 text-primary-800 px-2 py-1 rounded">
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenu de la page */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
};

const SidebarContent = ({ navigation, location, onLogout, user }) => {
  return (
    <div className="flex flex-col h-full bg-gray-800">
      {/* Logo */}
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-gray-900">
        <h1 className="text-white text-xl font-bold">Club CRM</h1>
      </div>

      {/* Navigation */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
                           (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="flex-shrink-0 border-t border-gray-700 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-white">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="flex-shrink-0 ml-2 p-1 text-gray-400 hover:text-white transition-colors duration-200"
              title="Se déconnecter"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;