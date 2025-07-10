const express = require('express');
const { executeQuery } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Route de tracking pour l'ouverture d'email (publique)
router.get('/open/:campaignId/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;

    // Enregistrer l'interaction d'ouverture
    await executeQuery(
      'INSERT IGNORE INTO email_interactions (campaign_id, contact_id, interaction_type, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)',
      [campaignId, contactId, 'ouverture', req.get('User-Agent'), req.ip]
    );

    // Mettre à jour le statut du destinataire s'il n'est pas déjà ouvert
    await executeQuery(
      'UPDATE campaign_recipients SET status = ?, opened_at = NOW() WHERE campaign_id = ? AND contact_id = ? AND status IN ("envoyé", "délivré")',
      ['ouvert', campaignId, contactId]
    );

    // Mettre à jour les statistiques de la campagne
    await executeQuery(
      'UPDATE email_campaigns SET opened_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status IN ("ouvert", "cliqué")) WHERE id = ?',
      [campaignId, campaignId]
    );

    // Retourner un pixel transparent 1x1
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.send(pixel);

  } catch (error) {
    console.error('Erreur tracking ouverture:', error);
    // Toujours retourner le pixel même en cas d'erreur
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    res.set('Content-Type', 'image/png');
    res.send(pixel);
  }
});

// Route de tracking pour les clics (publique)
router.get('/click/:campaignId/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;
    const { url } = req.query;

    // Enregistrer l'interaction de clic
    await executeQuery(
      'INSERT INTO email_interactions (campaign_id, contact_id, interaction_type, interaction_data, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [campaignId, contactId, 'clic', JSON.stringify({ url }), req.get('User-Agent'), req.ip]
    );

    // Mettre à jour le statut du destinataire
    await executeQuery(
      'UPDATE campaign_recipients SET status = ?, clicked_at = NOW() WHERE campaign_id = ? AND contact_id = ?',
      ['cliqué', campaignId, contactId]
    );

    // Mettre à jour les statistiques de la campagne
    await executeQuery(
      'UPDATE email_campaigns SET clicked_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = "cliqué") WHERE id = ?',
      [campaignId, campaignId]
    );

    // Rediriger vers l'URL cible
    if (url) {
      res.redirect(url);
    } else {
      res.status(400).json({ message: 'URL manquante' });
    }

  } catch (error) {
    console.error('Erreur tracking clic:', error);
    res.status(500).json({ message: 'Erreur de tracking' });
  }
});

// Route de désabonnement (publique)
router.get('/unsubscribe/:campaignId/:contactId', async (req, res) => {
  try {
    const { campaignId, contactId } = req.params;

    // Désabonner le contact
    await executeQuery(
      'UPDATE contacts SET subscription_status = ? WHERE id = ?',
      ['désabonné', contactId]
    );

    // Enregistrer l'interaction de désabonnement
    await executeQuery(
      'INSERT INTO email_interactions (campaign_id, contact_id, interaction_type, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)',
      [campaignId, contactId, 'désabonnement', req.get('User-Agent'), req.ip]
    );

    // Mettre à jour le statut du destinataire
    await executeQuery(
      'UPDATE campaign_recipients SET status = ?, unsubscribed_at = NOW() WHERE campaign_id = ? AND contact_id = ?',
      ['désabonné', campaignId, contactId]
    );

    // Mettre à jour les statistiques de la campagne
    await executeQuery(
      'UPDATE email_campaigns SET unsubscribed_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = "désabonné") WHERE id = ?',
      [campaignId, campaignId]
    );

    // Retourner une page de confirmation
    res.send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Désabonnement confirmé</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
          .container { background: #f8f9fa; padding: 40px; border-radius: 8px; }
          h1 { color: #28a745; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Désabonnement confirmé</h1>
          <p>Vous avez été désabonné avec succès de notre liste de diffusion.</p>
          <p>Vous ne recevrez plus d'emails de notre part.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Erreur désabonnement:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Erreur</title>
      </head>
      <body>
        <h1>Erreur</h1>
        <p>Une erreur s'est produite lors du désabonnement.</p>
      </body>
      </html>
    `);
  }
});

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

// Route pour obtenir les statistiques globales
router.get('/dashboard', async (req, res) => {
  try {
    const { period = '30' } = req.query; // derniers 30 jours par défaut

    // Statistiques générales
    const totalContacts = await executeQuery('SELECT COUNT(*) as count FROM contacts');
    const activeContacts = await executeQuery('SELECT COUNT(*) as count FROM contacts WHERE status = "actif"');
    const subscribedContacts = await executeQuery('SELECT COUNT(*) as count FROM contacts WHERE subscription_status = "abonné"');
    
    const totalCampaigns = await executeQuery('SELECT COUNT(*) as count FROM email_campaigns');
    const sentCampaigns = await executeQuery('SELECT COUNT(*) as count FROM email_campaigns WHERE status = "envoyé"');

    // Statistiques des campagnes récentes
    const campaignStats = await executeQuery(`
      SELECT 
        COUNT(*) as total_campaigns,
        SUM(sent_count) as total_emails_sent,
        SUM(delivered_count) as total_delivered,
        SUM(opened_count) as total_opened,
        SUM(clicked_count) as total_clicked,
        SUM(unsubscribed_count) as total_unsubscribed
      FROM email_campaigns 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [period]);

    // Évolution des contacts (derniers jours)
    const contactsEvolution = await executeQuery(`
      SELECT 
        DATE(created_at) as date, 
        COUNT(*) as new_contacts
      FROM contacts 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [period]);

    // Évolution des emails envoyés
    const emailsEvolution = await executeQuery(`
      SELECT 
        DATE(sent_at) as date,
        SUM(sent_count) as emails_sent,
        SUM(opened_count) as emails_opened,
        SUM(clicked_count) as emails_clicked
      FROM email_campaigns 
      WHERE sent_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(sent_at)
      ORDER BY date
    `, [period]);

    // Top campagnes par performance
    const topCampaigns = await executeQuery(`
      SELECT 
        id,
        name,
        sent_count,
        opened_count,
        clicked_count,
        ROUND((opened_count / NULLIF(sent_count, 0)) * 100, 2) as open_rate,
        ROUND((clicked_count / NULLIF(sent_count, 0)) * 100, 2) as click_rate
      FROM email_campaigns 
      WHERE status = 'envoyé' AND sent_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      ORDER BY open_rate DESC
      LIMIT 10
    `, [period]);

    const stats = campaignStats[0] || {};

    res.json({
      overview: {
        contacts: {
          total: totalContacts[0].count,
          active: activeContacts[0].count,
          subscribed: subscribedContacts[0].count
        },
        campaigns: {
          total: totalCampaigns[0].count,
          sent: sentCampaigns[0].count
        },
        emails: {
          sent: stats.total_emails_sent || 0,
          delivered: stats.total_delivered || 0,
          opened: stats.total_opened || 0,
          clicked: stats.total_clicked || 0,
          unsubscribed: stats.total_unsubscribed || 0,
          open_rate: stats.total_emails_sent ? ((stats.total_opened / stats.total_emails_sent) * 100).toFixed(2) : 0,
          click_rate: stats.total_emails_sent ? ((stats.total_clicked / stats.total_emails_sent) * 100).toFixed(2) : 0
        }
      },
      evolution: {
        contacts: contactsEvolution,
        emails: emailsEvolution
      },
      top_campaigns: topCampaigns
    });

  } catch (error) {
    console.error('Erreur récupération dashboard:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des statistiques' });
  }
});

// Route pour les statistiques détaillées d'une campagne
router.get('/campaign/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Informations de base de la campagne
    const campaign = await executeQuery(
      'SELECT * FROM email_campaigns WHERE id = ?',
      [id]
    );

    if (campaign.length === 0) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }

    // Statistiques détaillées par statut
    const statusStats = await executeQuery(`
      SELECT 
        status,
        COUNT(*) as count
      FROM campaign_recipients 
      WHERE campaign_id = ?
      GROUP BY status
    `, [id]);

    // Évolution temporelle des interactions
    const interactionTimeline = await executeQuery(`
      SELECT 
        DATE(created_at) as date,
        interaction_type,
        COUNT(*) as count
      FROM email_interactions 
      WHERE campaign_id = ?
      GROUP BY DATE(created_at), interaction_type
      ORDER BY date
    `, [id]);

    // Top domaines email
    const emailDomains = await executeQuery(`
      SELECT 
        SUBSTRING_INDEX(c.email, '@', -1) as domain,
        COUNT(*) as count,
        SUM(CASE WHEN cr.status IN ('ouvert', 'cliqué') THEN 1 ELSE 0 END) as opened_count
      FROM campaign_recipients cr
      JOIN contacts c ON cr.contact_id = c.id
      WHERE cr.campaign_id = ?
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 10
    `, [id]);

    // Heures d'ouverture
    const openingHours = await executeQuery(`
      SELECT 
        HOUR(opened_at) as hour,
        COUNT(*) as count
      FROM campaign_recipients 
      WHERE campaign_id = ? AND opened_at IS NOT NULL
      GROUP BY HOUR(opened_at)
      ORDER BY hour
    `, [id]);

    res.json({
      campaign: campaign[0],
      stats: {
        by_status: statusStats,
        timeline: interactionTimeline,
        email_domains: emailDomains,
        opening_hours: openingHours
      }
    });

  } catch (error) {
    console.error('Erreur récupération stats campagne:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des statistiques' });
  }
});

// Route pour les statistiques de performance par type de contact
router.get('/performance/contacts', async (req, res) => {
  try {
    const { period = '30' } = req.query;

    const performanceByType = await executeQuery(`
      SELECT 
        c.contact_type,
        COUNT(DISTINCT cr.contact_id) as total_recipients,
        COUNT(DISTINCT CASE WHEN cr.status IN ('ouvert', 'cliqué') THEN cr.contact_id END) as opened_recipients,
        COUNT(DISTINCT CASE WHEN cr.status = 'cliqué' THEN cr.contact_id END) as clicked_recipients,
        ROUND((COUNT(DISTINCT CASE WHEN cr.status IN ('ouvert', 'cliqué') THEN cr.contact_id END) / COUNT(DISTINCT cr.contact_id)) * 100, 2) as open_rate,
        ROUND((COUNT(DISTINCT CASE WHEN cr.status = 'cliqué' THEN cr.contact_id END) / COUNT(DISTINCT cr.contact_id)) * 100, 2) as click_rate
      FROM campaign_recipients cr
      JOIN contacts c ON cr.contact_id = c.id
      JOIN email_campaigns ec ON cr.campaign_id = ec.id
      WHERE ec.sent_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY c.contact_type
      ORDER BY open_rate DESC
    `, [period]);

    res.json({ performance_by_type: performanceByType });

  } catch (error) {
    console.error('Erreur récupération performance contacts:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des performances' });
  }
});

// Route pour exporter les statistiques
router.get('/export/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaignData = await executeQuery(`
      SELECT 
        c.first_name,
        c.last_name,
        c.email,
        c.company,
        c.contact_type,
        cr.status,
        cr.sent_at,
        cr.opened_at,
        cr.clicked_at,
        cr.unsubscribed_at
      FROM campaign_recipients cr
      JOIN contacts c ON cr.contact_id = c.id
      WHERE cr.campaign_id = ?
      ORDER BY cr.sent_at
    `, [campaignId]);

    // Convertir en CSV
    const csvHeader = 'Prénom,Nom,Email,Entreprise,Type,Statut,Envoyé le,Ouvert le,Cliqué le,Désabonné le\n';
    const csvData = campaignData.map(row => [
      row.first_name,
      row.last_name,
      row.email,
      row.company || '',
      row.contact_type,
      row.status,
      row.sent_at ? new Date(row.sent_at).toLocaleString('fr-FR') : '',
      row.opened_at ? new Date(row.opened_at).toLocaleString('fr-FR') : '',
      row.clicked_at ? new Date(row.clicked_at).toLocaleString('fr-FR') : '',
      row.unsubscribed_at ? new Date(row.unsubscribed_at).toLocaleString('fr-FR') : ''
    ].map(field => `"${field}"`).join(',')).join('\n');

    const csv = csvHeader + csvData;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campagne_${campaignId}_stats.csv"`);
    res.send(csv);

  } catch (error) {
    console.error('Erreur export statistiques:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'export' });
  }
});

module.exports = router;