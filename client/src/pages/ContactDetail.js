import React from 'react';

const ContactDetail = () => {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Détail du Contact</h1>
        <p className="text-gray-600">Informations détaillées du contact</p>
      </div>

      <div className="card">
        <div className="card-body text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Détail du Contact
          </h3>
          <p className="text-gray-500 mb-4">
            Cette page affichera les informations détaillées d'un contact spécifique.
          </p>
          <p className="text-sm text-gray-400">
            En cours de développement...
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContactDetail;