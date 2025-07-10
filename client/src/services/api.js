import axios from 'axios';
import { toast } from 'react-toastify';

// Configuration de base d'Axios
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur de requête
api.interceptors.request.use(
  (config) => {
    // Ajouter le token d'authentification si disponible
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur de réponse
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Erreurs du serveur
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // Token expiré ou invalide
          localStorage.removeItem('token');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          toast.error('Session expirée. Veuillez vous reconnecter.');
          break;
        case 403:
          toast.error('Accès refusé. Droits insuffisants.');
          break;
        case 404:
          toast.error('Ressource non trouvée.');
          break;
        case 422:
          // Erreurs de validation
          if (data.errors && Array.isArray(data.errors)) {
            data.errors.forEach(err => toast.error(err.msg));
          } else {
            toast.error(data.message || 'Données invalides.');
          }
          break;
        case 500:
          toast.error('Erreur serveur. Veuillez réessayer plus tard.');
          break;
        default:
          toast.error(data.message || 'Une erreur est survenue.');
      }
    } else if (error.request) {
      // Erreur réseau
      toast.error('Erreur de connexion. Vérifiez votre connexion internet.');
    } else {
      // Autres erreurs
      toast.error('Une erreur inattendue est survenue.');
    }
    
    return Promise.reject(error);
  }
);

export default api;

// Services API spécialisés

// Authentification
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  verifyToken: () => api.get('/auth/verify'),
  getUsers: (params) => api.get('/auth/users', { params }),
  updateUserStatus: (id, data) => api.patch(`/auth/users/${id}/status`, data)
};

// Contacts
export const contactsAPI = {
  getContacts: (params) => api.get('/contacts', { params }),
  getContact: (id) => api.get(`/contacts/${id}`),
  createContact: (data) => api.post('/contacts', data),
  updateContact: (id, data) => api.put(`/contacts/${id}`, data),
  deleteContact: (id) => api.delete(`/contacts/${id}`),
  getStats: () => api.get('/contacts/stats/overview'),
  searchAutocomplete: (query) => api.get('/contacts/search/autocomplete', { params: { q: query } }),
  bulkUpdateSubscription: (data) => api.patch('/contacts/bulk/subscription', data)
};

// Campagnes
export const campaignsAPI = {
  getCampaigns: (params) => api.get('/campaigns', { params }),
  getCampaign: (id) => api.get(`/campaigns/${id}`),
  createCampaign: (data) => api.post('/campaigns', data),
  updateCampaign: (id, data) => api.put(`/campaigns/${id}`, data),
  deleteCampaign: (id) => api.delete(`/campaigns/${id}`),
  sendCampaign: (id, data) => api.post(`/campaigns/${id}/send`, data),
  cancelCampaign: (id) => api.post(`/campaigns/${id}/cancel`),
  duplicateCampaign: (id, data) => api.post(`/campaigns/${id}/duplicate`, data),
  addRecipients: (id, data) => api.post(`/campaigns/${id}/recipients`, data),
  getRecipients: (id, params) => api.get(`/campaigns/${id}/recipients`, { params }),
  sendTestEmail: (id, data) => api.post(`/campaigns/${id}/test`, data)
};

// Analytics
export const analyticsAPI = {
  getDashboard: (params) => api.get('/analytics/dashboard', { params }),
  getCampaignStats: (id) => api.get(`/analytics/campaign/${id}`),
  getContactPerformance: (params) => api.get('/analytics/performance/contacts', { params }),
  exportStats: (campaignId) => api.get(`/analytics/export/${campaignId}`, { responseType: 'blob' })
};

// Upload et Import/Export
export const uploadAPI = {
  importContacts: (formData) => api.post('/upload/contacts/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  exportContacts: (params) => api.get('/upload/contacts/export', { 
    params,
    responseType: 'blob'
  }),
  downloadTemplate: () => api.get('/upload/contacts/template', { 
    responseType: 'blob'
  }),
  validateCSV: (formData) => api.post('/upload/contacts/validate', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  getImportHistory: (params) => api.get('/upload/imports/history', { params }),
  getImportDetails: (id) => api.get(`/upload/imports/${id}`)
};

// Templates email
export const templatesAPI = {
  getTemplates: (params) => api.get('/templates', { params }),
  getTemplate: (id) => api.get(`/templates/${id}`),
  createTemplate: (data) => api.post('/templates', data),
  updateTemplate: (id, data) => api.put(`/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/templates/${id}`)
};

// Groupes de contacts
export const groupsAPI = {
  getGroups: (params) => api.get('/groups', { params }),
  getGroup: (id) => api.get(`/groups/${id}`),
  createGroup: (data) => api.post('/groups', data),
  updateGroup: (id, data) => api.put(`/groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/groups/${id}`),
  addContactsToGroup: (id, contactIds) => api.post(`/groups/${id}/contacts`, { contact_ids: contactIds }),
  removeContactsFromGroup: (id, contactIds) => api.delete(`/groups/${id}/contacts`, { data: { contact_ids: contactIds } })
};