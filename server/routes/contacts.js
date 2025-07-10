const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Route pour lister les contacts avec pagination et filtres
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      contact_type = '', 
      status = '', 
      subscription_status = '',
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    // Recherche globale
    if (search) {
      whereConditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Filtres
    if (contact_type) {
      whereConditions.push('contact_type = ?');
      params.push(contact_type);
    }

    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }

    if (subscription_status) {
      whereConditions.push('subscription_status = ?');
      params.push(subscription_status);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Compter le total
    const countResult = await executeQuery(
      `SELECT COUNT(*) as total FROM contacts ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Validar sort_by pour éviter les injections SQL
    const allowedSortFields = ['first_name', 'last_name', 'email', 'company', 'contact_type', 'status', 'created_at', 'updated_at'];
    const validSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const validSortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Récupérer les contacts
    const contacts = await executeQuery(
      `SELECT * FROM contacts ${whereClause} 
       ORDER BY ${validSortBy} ${validSortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des contacts:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des contacts' });
  }
});

// Route pour obtenir un contact par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const contacts = await executeQuery(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    res.json({ contact: contacts[0] });

  } catch (error) {
    console.error('Erreur lors de la récupération du contact:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération du contact' });
  }
});

// Route pour créer un nouveau contact
router.post('/', [
  body('email').isEmail().normalizeEmail().withMessage('Email valide requis'),
  body('first_name').trim().isLength({ min: 1 }).withMessage('Prénom requis'),
  body('last_name').trim().isLength({ min: 1 }).withMessage('Nom requis'),
  body('phone').optional().isMobilePhone().withMessage('Numéro de téléphone invalide'),
  body('contact_type').optional().isIn(['membre', 'visiteur', 'entreprise', 'partenaire']).withMessage('Type de contact invalide'),
  body('status').optional().isIn(['actif', 'inactif', 'bloqué']).withMessage('Statut invalide'),
  body('subscription_status').optional().isIn(['abonné', 'désabonné']).withMessage('Statut d\'abonnement invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Données invalides', 
        errors: errors.array() 
      });
    }

    const {
      email,
      first_name,
      last_name,
      phone,
      company,
      position,
      address,
      city,
      postal_code,
      country = 'France',
      contact_type = 'visiteur',
      status = 'actif',
      subscription_status = 'abonné',
      tags,
      notes
    } = req.body;

    // Vérifier si l'email existe déjà
    const existingContacts = await executeQuery(
      'SELECT id FROM contacts WHERE email = ?',
      [email]
    );

    if (existingContacts.length > 0) {
      return res.status(409).json({ message: 'Un contact avec cet email existe déjà' });
    }

    // Créer le contact
    const result = await executeQuery(
      `INSERT INTO contacts (
        email, first_name, last_name, phone, company, position, 
        address, city, postal_code, country, contact_type, status, 
        subscription_status, tags, notes, last_interaction
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        email, first_name, last_name, phone, company, position,
        address, city, postal_code, country, contact_type, status,
        subscription_status, tags ? JSON.stringify(tags) : null, notes
      ]
    );

    // Récupérer le contact créé
    const newContact = await executeQuery(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Contact créé avec succès',
      contact: newContact[0]
    });

  } catch (error) {
    console.error('Erreur lors de la création du contact:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la création du contact' });
  }
});

// Route pour mettre à jour un contact
router.put('/:id', [
  body('email').optional().isEmail().normalizeEmail().withMessage('Email valide requis'),
  body('first_name').optional().trim().isLength({ min: 1 }).withMessage('Prénom requis'),
  body('last_name').optional().trim().isLength({ min: 1 }).withMessage('Nom requis'),
  body('phone').optional().isMobilePhone().withMessage('Numéro de téléphone invalide'),
  body('contact_type').optional().isIn(['membre', 'visiteur', 'entreprise', 'partenaire']).withMessage('Type de contact invalide'),
  body('status').optional().isIn(['actif', 'inactif', 'bloqué']).withMessage('Statut invalide'),
  body('subscription_status').optional().isIn(['abonné', 'désabonné']).withMessage('Statut d\'abonnement invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Données invalides', 
        errors: errors.array() 
      });
    }

    const { id } = req.params;
    const {
      email,
      first_name,
      last_name,
      phone,
      company,
      position,
      address,
      city,
      postal_code,
      country,
      contact_type,
      status,
      subscription_status,
      tags,
      notes
    } = req.body;

    // Vérifier si le contact existe
    const existingContact = await executeQuery(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );

    if (existingContact.length === 0) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    // Si l'email change, vérifier qu'il n'existe pas déjà
    if (email && email !== existingContact[0].email) {
      const emailCheck = await executeQuery(
        'SELECT id FROM contacts WHERE email = ? AND id != ?',
        [email, id]
      );

      if (emailCheck.length > 0) {
        return res.status(409).json({ message: 'Un contact avec cet email existe déjà' });
      }
    }

    // Construire la requête de mise à jour
    const updates = [];
    const values = [];

    const fields = {
      email, first_name, last_name, phone, company, position,
      address, city, postal_code, country, contact_type, status,
      subscription_status, notes
    };

    Object.entries(fields).forEach(([field, value]) => {
      if (value !== undefined) {
        updates.push(`${field} = ?`);
        values.push(value);
      }
    });

    if (tags !== undefined) {
      updates.push('tags = ?');
      values.push(tags ? JSON.stringify(tags) : null);
    }

    // Mettre à jour last_interaction
    updates.push('last_interaction = CURDATE()');

    if (updates.length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    values.push(id);

    await executeQuery(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Récupérer le contact mis à jour
    const updatedContact = await executeQuery(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );

    res.json({
      message: 'Contact mis à jour avec succès',
      contact: updatedContact[0]
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du contact:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour du contact' });
  }
});

// Route pour supprimer un contact
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier si le contact existe
    const existingContact = await executeQuery(
      'SELECT id FROM contacts WHERE id = ?',
      [id]
    );

    if (existingContact.length === 0) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    // Supprimer le contact (les relations seront supprimées en cascade)
    await executeQuery('DELETE FROM contacts WHERE id = ?', [id]);

    res.json({ message: 'Contact supprimé avec succès' });

  } catch (error) {
    console.error('Erreur lors de la suppression du contact:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression du contact' });
  }
});

// Route pour obtenir les statistiques des contacts
router.get('/stats/overview', async (req, res) => {
  try {
    // Statistiques générales
    const totalContacts = await executeQuery('SELECT COUNT(*) as count FROM contacts');
    const activeContacts = await executeQuery('SELECT COUNT(*) as count FROM contacts WHERE status = "actif"');
    const subscribedContacts = await executeQuery('SELECT COUNT(*) as count FROM contacts WHERE subscription_status = "abonné"');

    // Répartition par type
    const contactsByType = await executeQuery(`
      SELECT contact_type, COUNT(*) as count 
      FROM contacts 
      GROUP BY contact_type
    `);

    // Répartition par statut
    const contactsByStatus = await executeQuery(`
      SELECT status, COUNT(*) as count 
      FROM contacts 
      GROUP BY status
    `);

    // Évolution des contacts (derniers 30 jours)
    const recentContacts = await executeQuery(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM contacts 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({
      overview: {
        total: totalContacts[0].count,
        active: activeContacts[0].count,
        subscribed: subscribedContacts[0].count
      },
      byType: contactsByType,
      byStatus: contactsByStatus,
      recent: recentContacts
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des statistiques' });
  }
});

// Route pour rechercher des contacts avec autocomplétion
router.get('/search/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await executeQuery(`
      SELECT id, first_name, last_name, email, company
      FROM contacts
      WHERE (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company LIKE ?)
      AND status = 'actif'
      LIMIT 10
    `, [
      `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`
    ]);

    const formattedSuggestions = suggestions.map(contact => ({
      id: contact.id,
      label: `${contact.first_name} ${contact.last_name}${contact.company ? ` (${contact.company})` : ''}`,
      email: contact.email
    }));

    res.json({ suggestions: formattedSuggestions });

  } catch (error) {
    console.error('Erreur lors de la recherche d\'autocomplétion:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la recherche' });
  }
});

// Route pour mettre à jour le statut d'abonnement en masse
router.patch('/bulk/subscription', [
  body('contact_ids').isArray({ min: 1 }).withMessage('Liste des contacts requise'),
  body('subscription_status').isIn(['abonné', 'désabonné']).withMessage('Statut d\'abonnement invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Données invalides', 
        errors: errors.array() 
      });
    }

    const { contact_ids, subscription_status } = req.body;

    // Créer les placeholders pour la requête IN
    const placeholders = contact_ids.map(() => '?').join(',');

    await executeQuery(
      `UPDATE contacts SET subscription_status = ?, last_interaction = CURDATE() WHERE id IN (${placeholders})`,
      [subscription_status, ...contact_ids]
    );

    res.json({ 
      message: `${contact_ids.length} contact(s) mis à jour avec le statut: ${subscription_status}` 
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour en masse:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour en masse' });
  }
});

module.exports = router;