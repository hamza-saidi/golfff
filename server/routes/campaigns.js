const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Route pour lister les campagnes
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = '', 
      search = '',
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    // Filtres
    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }

    if (search) {
      whereConditions.push('(name LIKE ? OR subject LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Compter le total
    const countResult = await executeQuery(
      `SELECT COUNT(*) as total FROM email_campaigns ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Validar sort_by
    const allowedSortFields = ['name', 'subject', 'status', 'created_at', 'sent_at', 'recipient_count'];
    const validSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const validSortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Récupérer les campagnes
    const campaigns = await executeQuery(
      `SELECT c.*, u.first_name as creator_name, u.last_name as creator_surname
       FROM email_campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       ${whereClause} 
       ORDER BY c.${validSortBy} ${validSortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des campagnes:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des campagnes' });
  }
});

// Route pour obtenir une campagne par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const campaigns = await executeQuery(
      `SELECT c.*, u.first_name as creator_name, u.last_name as creator_surname
       FROM email_campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [id]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    // Récupérer aussi les statistiques détaillées
    const stats = await executeQuery(
      `SELECT 
        status,
        COUNT(*) as count
       FROM campaign_recipients 
       WHERE campaign_id = ?
       GROUP BY status`,
      [id]
    );

    const campaign = campaigns[0];
    campaign.detailed_stats = stats;

    res.json({ campaign });

  } catch (error) {
    console.error('Erreur lors de la récupération de la campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération de la campagne' });
  }
});

// Route pour créer une nouvelle campagne
router.post('/', [
  body('name').trim().isLength({ min: 1 }).withMessage('Nom de campagne requis'),
  body('subject').trim().isLength({ min: 1 }).withMessage('Sujet requis'),
  body('html_content').trim().isLength({ min: 1 }).withMessage('Contenu HTML requis'),
  body('sender_name').optional().trim().isLength({ min: 1 }).withMessage('Nom d\'expéditeur invalide'),
  body('sender_email').optional().isEmail().withMessage('Email d\'expéditeur invalide'),
  body('recipient_criteria').optional().isObject().withMessage('Critères de destinataires invalides')
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
      name,
      subject,
      html_content,
      text_content,
      sender_name,
      sender_email,
      scheduled_at,
      recipient_criteria
    } = req.body;

    // Créer la campagne
    const result = await executeQuery(
      `INSERT INTO email_campaigns (
        name, subject, html_content, text_content, sender_name, sender_email,
        status, scheduled_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, subject, html_content, text_content, sender_name, sender_email,
        scheduled_at ? 'programmé' : 'brouillon', scheduled_at || null, req.user.id
      ]
    );

    const campaignId = result.insertId;

    // Si des critères de destinataires sont fournis, ajouter les destinataires
    if (recipient_criteria) {
      await addRecipientsToCampaign(campaignId, recipient_criteria);
    }

    // Récupérer la campagne créée
    const newCampaign = await executeQuery(
      `SELECT c.*, u.first_name as creator_name, u.last_name as creator_surname
       FROM email_campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [campaignId]
    );

    res.status(201).json({
      message: 'Campagne créée avec succès',
      campaign: newCampaign[0]
    });

  } catch (error) {
    console.error('Erreur lors de la création de la campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la création de la campagne' });
  }
});

// Route pour mettre à jour une campagne
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Nom de campagne requis'),
  body('subject').optional().trim().isLength({ min: 1 }).withMessage('Sujet requis'),
  body('html_content').optional().trim().isLength({ min: 1 }).withMessage('Contenu HTML requis')
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
      name,
      subject,
      html_content,
      text_content,
      sender_name,
      sender_email,
      scheduled_at
    } = req.body;

    // Vérifier si la campagne existe et n'est pas déjà envoyée
    const existingCampaign = await executeQuery(
      'SELECT * FROM email_campaigns WHERE id = ?',
      [id]
    );

    if (existingCampaign.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    if (existingCampaign[0].status === 'envoyé') {
      return res.status(400).json({ message: 'Impossible de modifier une campagne déjà envoyée' });
    }

    // Construire la requête de mise à jour
    const updates = [];
    const values = [];

    const fields = {
      name, subject, html_content, text_content, sender_name, sender_email
    };

    Object.entries(fields).forEach(([field, value]) => {
      if (value !== undefined) {
        updates.push(`${field} = ?`);
        values.push(value);
      }
    });

    // Gestion de scheduled_at
    if (scheduled_at !== undefined) {
      updates.push('scheduled_at = ?');
      values.push(scheduled_at);
      
      // Mettre à jour le statut selon la programmation
      if (scheduled_at) {
        updates.push('status = ?');
        values.push('programmé');
      } else if (existingCampaign[0].status === 'programmé') {
        updates.push('status = ?');
        values.push('brouillon');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    values.push(id);

    await executeQuery(
      `UPDATE email_campaigns SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Récupérer la campagne mise à jour
    const updatedCampaign = await executeQuery(
      `SELECT c.*, u.first_name as creator_name, u.last_name as creator_surname
       FROM email_campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [id]
    );

    res.json({
      message: 'Campagne mise à jour avec succès',
      campaign: updatedCampaign[0]
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour de la campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour de la campagne' });
  }
});

// Route pour ajouter des destinataires à une campagne
router.post('/:id/recipients', [
  body('criteria').optional().isObject().withMessage('Critères invalides'),
  body('contact_ids').optional().isArray().withMessage('Liste de contacts invalide')
], async (req, res) => {
  try {
    const { id } = req.params;
    const { criteria, contact_ids } = req.body;

    // Vérifier que la campagne existe et n'est pas envoyée
    const campaign = await executeQuery(
      'SELECT status FROM email_campaigns WHERE id = ?',
      [id]
    );

    if (campaign.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    if (campaign[0].status === 'envoyé') {
      return res.status(400).json({ message: 'Impossible de modifier les destinataires d\'une campagne envoyée' });
    }

    let addedCount = 0;

    if (contact_ids && contact_ids.length > 0) {
      // Ajouter des contacts spécifiques
      addedCount = await addSpecificContacts(id, contact_ids);
    } else if (criteria) {
      // Ajouter des contacts selon des critères
      addedCount = await addRecipientsToCampaign(id, criteria);
    } else {
      return res.status(400).json({ message: 'Critères ou liste de contacts requis' });
    }

    // Mettre à jour le compteur de destinataires
    await executeQuery(
      'UPDATE email_campaigns SET recipient_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?) WHERE id = ?',
      [id, id]
    );

    res.json({
      message: `${addedCount} destinataire(s) ajouté(s) à la campagne`,
      added_count: addedCount
    });

  } catch (error) {
    console.error('Erreur lors de l\'ajout des destinataires:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'ajout des destinataires' });
  }
});

// Route pour envoyer une campagne
router.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { send_immediately = false } = req.body;

    // Vérifier que la campagne existe
    const campaign = await executeQuery(
      'SELECT * FROM email_campaigns WHERE id = ?',
      [id]
    );

    if (campaign.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    const campaignData = campaign[0];

    if (campaignData.status === 'envoyé') {
      return res.status(400).json({ message: 'Cette campagne a déjà été envoyée' });
    }

    // Vérifier qu'il y a des destinataires
    const recipientCount = await executeQuery(
      'SELECT COUNT(*) as count FROM campaign_recipients WHERE campaign_id = ?',
      [id]
    );

    if (recipientCount[0].count === 0) {
      return res.status(400).json({ message: 'Aucun destinataire pour cette campagne' });
    }

    if (send_immediately || (campaignData.scheduled_at && new Date(campaignData.scheduled_at) <= new Date())) {
      // Envoyer immédiatement
      await emailService.sendCampaign(id);
      
      res.json({
        message: 'Campagne envoyée avec succès',
        sent_at: new Date().toISOString()
      });
    } else if (campaignData.scheduled_at) {
      // Programmer l'envoi
      await executeQuery(
        'UPDATE email_campaigns SET status = ? WHERE id = ?',
        ['programmé', id]
      );
      
      res.json({
        message: 'Campagne programmée avec succès',
        scheduled_at: campaignData.scheduled_at
      });
    } else {
      return res.status(400).json({ message: 'Date de programmation requise ou envoi immédiat' });
    }

  } catch (error) {
    console.error('Erreur lors de l\'envoi de la campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'envoi de la campagne' });
  }
});

// Route pour annuler une campagne programmée
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await executeQuery(
      'SELECT status FROM email_campaigns WHERE id = ?',
      [id]
    );

    if (campaign.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    if (campaign[0].status !== 'programmé') {
      return res.status(400).json({ message: 'Seules les campagnes programmées peuvent être annulées' });
    }

    await executeQuery(
      'UPDATE email_campaigns SET status = ?, scheduled_at = NULL WHERE id = ?',
      ['annulé', id]
    );

    res.json({ message: 'Campagne annulée avec succès' });

  } catch (error) {
    console.error('Erreur lors de l\'annulation de la campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'annulation de la campagne' });
  }
});

// Route pour obtenir les destinataires d'une campagne
router.get('/:id/recipients', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['cr.campaign_id = ?'];
    let params = [id];

    if (status) {
      whereConditions.push('cr.status = ?');
      params.push(status);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Compter le total
    const countResult = await executeQuery(
      `SELECT COUNT(*) as total FROM campaign_recipients cr ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Récupérer les destinataires
    const recipients = await executeQuery(
      `SELECT cr.*, c.first_name, c.last_name, c.email, c.company
       FROM campaign_recipients cr
       JOIN contacts c ON cr.contact_id = c.id
       ${whereClause}
       ORDER BY cr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      recipients,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des destinataires:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des destinataires' });
  }
});

// Route pour dupliquer une campagne
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { new_name } = req.body;

    const campaign = await executeQuery(
      'SELECT * FROM email_campaigns WHERE id = ?',
      [id]
    );

    if (campaign.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    const originalCampaign = campaign[0];
    const duplicateName = new_name || `${originalCampaign.name} (Copie)`;

    // Créer la campagne dupliquée
    const result = await executeQuery(
      `INSERT INTO email_campaigns (
        name, subject, html_content, text_content, sender_name, sender_email,
        status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'brouillon', ?)`,
      [
        duplicateName, originalCampaign.subject, originalCampaign.html_content,
        originalCampaign.text_content, originalCampaign.sender_name,
        originalCampaign.sender_email, req.user.id
      ]
    );

    const newCampaign = await executeQuery(
      'SELECT * FROM email_campaigns WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Campagne dupliquée avec succès',
      campaign: newCampaign[0]
    });

  } catch (error) {
    console.error('Erreur lors de la duplication de la campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la duplication de la campagne' });
  }
});

// Fonctions utilitaires

async function addRecipientsToCampaign(campaignId, criteria) {
  let query = 'SELECT id FROM contacts WHERE status = "actif" AND subscription_status = "abonné"';
  let params = [];

  // Ajouter les critères de filtrage
  if (criteria.contact_type) {
    query += ' AND contact_type = ?';
    params.push(criteria.contact_type);
  }

  if (criteria.tags && criteria.tags.length > 0) {
    const tagConditions = criteria.tags.map(() => 'JSON_CONTAINS(tags, ?)').join(' OR ');
    query += ` AND (${tagConditions})`;
    params.push(...criteria.tags.map(tag => JSON.stringify(tag)));
  }

  const contacts = await executeQuery(query, params);
  
  if (contacts.length === 0) {
    return 0;
  }

  // Insérer les destinataires (ignorer les doublons)
  const values = contacts.map(contact => `(${campaignId}, ${contact.id})`).join(',');
  
  await executeQuery(
    `INSERT IGNORE INTO campaign_recipients (campaign_id, contact_id) VALUES ${values}`
  );

  return contacts.length;
}

async function addSpecificContacts(campaignId, contactIds) {
  // Vérifier que les contacts existent et sont abonnés
  const placeholders = contactIds.map(() => '?').join(',');
  const validContacts = await executeQuery(
    `SELECT id FROM contacts WHERE id IN (${placeholders}) AND status = 'actif' AND subscription_status = 'abonné'`,
    contactIds
  );

  if (validContacts.length === 0) {
    return 0;
  }

  // Insérer les destinataires
  const values = validContacts.map(contact => `(${campaignId}, ${contact.id})`).join(',');
  
  await executeQuery(
    `INSERT IGNORE INTO campaign_recipients (campaign_id, contact_id) VALUES ${values}`
  );

  return validContacts.length;
}

module.exports = router;