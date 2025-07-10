import React from 'react';
import { useQuery } from 'react-query';
import { analyticsAPI, contactsAPI } from '../services/api';
import { Users, Mail, TrendingUp, UserCheck } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard = () => {
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery(
    'dashboard',
    () => analyticsAPI.getDashboard(),
    {
      refetchOnWindowFocus: false,
    }
  );

  const { data: contactStats, isLoading: contactsLoading } = useQuery(
    'contact-stats',
    () => contactsAPI.getStats(),
    {
      refetchOnWindowFocus: false,
    }
  );

  if (dashboardLoading || contactsLoading) {
    return <LoadingSpinner text="Chargement du tableau de bord..." />;
  }

  const stats = dashboardData?.data?.overview || {};
  const contactData = contactStats?.data || {};

  const statCards = [
    {
      title: 'Total Contacts',
      value: contactData.overview?.total || 0,
      icon: Users,
      color: 'blue',
      change: '+12%',
      changeType: 'increase'
    },
    {
      title: 'Contacts Actifs',
      value: contactData.overview?.active || 0,
      icon: UserCheck,
      color: 'green',
      change: '+5%',
      changeType: 'increase'
    },
    {
      title: 'Emails Envoyés',
      value: stats.emails?.sent || 0,
      icon: Mail,
      color: 'purple',
      change: '+23%',
      changeType: 'increase'
    },
    {
      title: 'Taux d\'Ouverture',
      value: `${stats.emails?.open_rate || 0}%`,
      icon: TrendingUp,
      color: 'orange',
      change: '+2.1%',
      changeType: 'increase'
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de Bord</h1>
        <p className="text-gray-600">Vue d'ensemble de votre plateforme CRM</p>
      </div>

      {/* Statistiques principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Graphiques et tableaux */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Répartition par type de contact */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">
              Répartition des Contacts
            </h3>
          </div>
          <div className="card-body">
            {contactData.byType && contactData.byType.length > 0 ? (
              <div className="space-y-3">
                {contactData.byType.map((type, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${getTypeColor(type.contact_type)}`}></div>
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {type.contact_type}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{type.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">Aucune donnée disponible</p>
            )}
          </div>
        </div>

        {/* Campagnes récentes */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">
              Activité Récente
            </h3>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Nouveaux contacts ajoutés
                  </p>
                  <p className="text-sm text-gray-500">Il y a 2 heures</p>
                </div>
                <div className="text-sm text-gray-400">+5</div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Mail className="w-4 h-4 text-green-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Campagne newsletter envoyée
                  </p>
                  <p className="text-sm text-gray-500">Il y a 1 jour</p>
                </div>
                <div className="text-sm text-gray-400">250 emails</div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Rapport mensuel généré
                  </p>
                  <p className="text-sm text-gray-500">Il y a 3 jours</p>
                </div>
                <div className="text-sm text-gray-400">PDF</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="mt-8">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Actions Rapides</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickAction
            title="Ajouter un contact"
            description="Créer un nouveau contact dans la base"
            href="/contacts"
            color="blue"
          />
          <QuickAction
            title="Nouvelle campagne"
            description="Lancer une campagne email"
            href="/campaigns/new"
            color="green"
          />
          <QuickAction
            title="Voir les stats"
            description="Consulter les analytics détaillées"
            href="/analytics"
            color="purple"
          />
        </div>
      </div>
    </div>
  );
};

// Composant StatCard
const StatCard = ({ title, value, icon: Icon, color, change, changeType }) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`w-8 h-8 ${colorClasses[color]} rounded-md flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">{value}</div>
                <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                  changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {change}
                </div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

// Composant QuickAction
const QuickAction = ({ title, description, href, color }) => {
  const colorClasses = {
    blue: 'border-blue-200 hover:border-blue-300 hover:bg-blue-50',
    green: 'border-green-200 hover:border-green-300 hover:bg-green-50',
    purple: 'border-purple-200 hover:border-purple-300 hover:bg-purple-50',
  };

  return (
    <a
      href={href}
      className={`block p-4 border-2 border-dashed rounded-lg transition-colors ${colorClasses[color]}`}
    >
      <h4 className="text-sm font-medium text-gray-900">{title}</h4>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </a>
  );
};

// Fonction utilitaire pour les couleurs des types
const getTypeColor = (type) => {
  const colors = {
    membre: 'bg-blue-400',
    visiteur: 'bg-green-400',
    entreprise: 'bg-purple-400',
    partenaire: 'bg-orange-400',
  };
  return colors[type] || 'bg-gray-400';
};

export default Dashboard;