import React from 'react';

const Campaigns = () => {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Campagnes Email</h1>
        <p className="text-gray-600">Gérez vos campagnes d'email marketing</p>
      </div>

      <div className="card">
        <div className="card-body text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Campagnes Email
          </h3>
          <p className="text-gray-500 mb-4">
            Cette page permettra de créer, gérer et suivre vos campagnes d'email marketing.
          </p>
          <p className="text-sm text-gray-400">
            En cours de développement...
          </p>
        </div>
      </div>
    </div>
  );
};

export default Campaigns;