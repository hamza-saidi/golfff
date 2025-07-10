const nodemailer = require('nodemailer');
const { executeQuery } = require('../config/database');
require('dotenv').config();

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  // Initialiser le transporteur de mail
  initTransporter() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT == 465, // true pour 465, false pour autres ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      pool: true,
      maxConnections: 5,
      rateLimit: 14 // emails par seconde
    });

    // Vérifier la connexion
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Erreur de configuration SMTP:', error);
      } else {
        console.log('✅ Configuration SMTP opérationnelle');
      }
    });
  }

  // Envoyer une campagne complète
  async sendCampaign(campaignId) {
    try {
      console.log(`🚀 Début de l'envoi de la campagne ${campaignId}`);

      // Récupérer les données de la campagne
      const campaign = await executeQuery(
        'SELECT * FROM email_campaigns WHERE id = ?',
        [campaignId]
      );

      if (campaign.length === 0) {
        throw new Error('Campagne non trouvée');
      }

      const campaignData = campaign[0];

      if (campaignData.status === 'envoyé') {
        throw new Error('Cette campagne a déjà été envoyée');
      }

      // Marquer la campagne comme en cours d'envoi
      await executeQuery(
        'UPDATE email_campaigns SET status = ?, sent_at = NOW() WHERE id = ?',
        ['envoyé', campaignId]
      );

      // Récupérer tous les destinataires en attente
      const recipients = await executeQuery(
        `SELECT cr.*, c.email, c.first_name, c.last_name, c.company
         FROM campaign_recipients cr
         JOIN contacts c ON cr.contact_id = c.id
         WHERE cr.campaign_id = ? AND cr.status = 'en_attente'`,
        [campaignId]
      );

      console.log(`📧 ${recipients.length} emails à envoyer`);

      let sentCount = 0;
      let errorCount = 0;

      // Envoyer les emails par lots
      const batchSize = 10;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        
        const promises = batch.map(recipient => 
          this.sendSingleEmail(campaignData, recipient)
        );

        const results = await Promise.allSettled(promises);
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            sentCount++;
          } else {
            errorCount++;
            console.error(`Erreur envoi email ${batch[index].email}:`, result.reason);
          }
        });

        // Petite pause entre les lots pour éviter la surcharge
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Mettre à jour les statistiques de la campagne
      await executeQuery(
        `UPDATE email_campaigns SET 
         sent_count = ?, 
         delivered_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'délivré')
         WHERE id = ?`,
        [sentCount, campaignId, campaignId]
      );

      console.log(`✅ Campagne ${campaignId} terminée: ${sentCount} envoyés, ${errorCount} erreurs`);

      return {
        success: true,
        sent: sentCount,
        errors: errorCount,
        total: recipients.length
      };

    } catch (error) {
      console.error('Erreur lors de l\'envoi de la campagne:', error);
      
      // Marquer la campagne comme échouée
      await executeQuery(
        'UPDATE email_campaigns SET status = ? WHERE id = ?',
        ['brouillon', campaignId]
      );

      throw error;
    }
  }

  // Envoyer un email individuel
  async sendSingleEmail(campaignData, recipient) {
    try {
      // Personnaliser le contenu
      const personalizedContent = this.personalizeContent(campaignData, recipient);
      
      // Générer les URLs de tracking
      const trackingUrls = this.generateTrackingUrls(campaignData.id, recipient.contact_id);

      // Ajouter le pixel de tracking d'ouverture au contenu HTML
      const htmlWithTracking = this.addOpenTracking(personalizedContent.html, trackingUrls.openUrl);

      const mailOptions = {
        from: `"${campaignData.sender_name || 'Club de Golf'}" <${campaignData.sender_email || process.env.SMTP_USER}>`,
        to: recipient.email,
        subject: personalizedContent.subject,
        text: personalizedContent.text,
        html: htmlWithTracking,
        headers: {
          'List-Unsubscribe': `<${trackingUrls.unsubscribeUrl}>`,
          'X-Campaign-ID': campaignData.id.toString()
        }
      };

      // Envoyer l'email
      const info = await this.transporter.sendMail(mailOptions);

      // Marquer comme envoyé dans la base de données
      await executeQuery(
        'UPDATE campaign_recipients SET status = ?, sent_at = NOW() WHERE campaign_id = ? AND contact_id = ?',
        ['envoyé', campaignData.id, recipient.contact_id]
      );

      // Log de succès
      console.log(`📧 Email envoyé à ${recipient.email} - ID: ${info.messageId}`);

      return { success: true, messageId: info.messageId };

    } catch (error) {
      // Marquer comme échec
      await executeQuery(
        'UPDATE campaign_recipients SET status = ?, bounce_reason = ? WHERE campaign_id = ? AND contact_id = ?',
        ['echec', error.message, campaignData.id, recipient.contact_id]
      );

      throw error;
    }
  }

  // Personnaliser le contenu avec les données du contact
  personalizeContent(campaignData, recipient) {
    const variables = {
      first_name: recipient.first_name || 'Cher contact',
      last_name: recipient.last_name || '',
      full_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim(),
      email: recipient.email,
      company: recipient.company || '',
      date: new Date().toLocaleDateString('fr-FR')
    };

    let personalizedSubject = campaignData.subject;
    let personalizedHtml = campaignData.html_content;
    let personalizedText = campaignData.text_content || '';

    // Remplacer les variables dans le contenu
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{${key}}`, 'g');
      personalizedSubject = personalizedSubject.replace(regex, value);
      personalizedHtml = personalizedHtml.replace(regex, value);
      personalizedText = personalizedText.replace(regex, value);
    });

    return {
      subject: personalizedSubject,
      html: personalizedHtml,
      text: personalizedText
    };
  }

  // Générer les URLs de tracking
  generateTrackingUrls(campaignId, contactId) {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    
    return {
      openUrl: `${baseUrl}/api/tracking/open/${campaignId}/${contactId}`,
      unsubscribeUrl: `${baseUrl}/api/tracking/unsubscribe/${campaignId}/${contactId}`,
      clickUrl: `${baseUrl}/api/tracking/click/${campaignId}/${contactId}`
    };
  }

  // Ajouter le pixel de tracking d'ouverture
  addOpenTracking(htmlContent, openUrl) {
    const trackingPixel = `<img src="${openUrl}" width="1" height="1" style="display:none;" alt=""/>`;
    
    // Insérer le pixel avant la balise de fermeture du body ou à la fin
    if (htmlContent.includes('</body>')) {
      return htmlContent.replace('</body>', `${trackingPixel}</body>`);
    } else {
      return htmlContent + trackingPixel;
    }
  }

  // Envoyer un email de test
  async sendTestEmail(campaignData, testEmail) {
    try {
      const mockRecipient = {
        email: testEmail,
        first_name: 'Test',
        last_name: 'User',
        company: 'Test Company',
        contact_id: 0
      };

      const personalizedContent = this.personalizeContent(campaignData, mockRecipient);

      const mailOptions = {
        from: `"${campaignData.sender_name || 'Club de Golf'}" <${campaignData.sender_email || process.env.SMTP_USER}>`,
        to: testEmail,
        subject: `[TEST] ${personalizedContent.subject}`,
        text: personalizedContent.text,
        html: personalizedContent.html,
        headers: {
          'X-Campaign-Test': 'true'
        }
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(`📧 Email de test envoyé à ${testEmail} - ID: ${info.messageId}`);
      
      return { success: true, messageId: info.messageId };

    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email de test:', error);
      throw error;
    }
  }

  // Envoyer un email transactionnel simple
  async sendTransactionalEmail(to, subject, content, options = {}) {
    try {
      const mailOptions = {
        from: `"${options.senderName || 'Club de Golf'}" <${options.senderEmail || process.env.SMTP_USER}>`,
        to: to,
        subject: subject,
        text: content.text || '',
        html: content.html || '',
        ...options.mailOptions
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(`📧 Email transactionnel envoyé à ${to} - ID: ${info.messageId}`);
      
      return { success: true, messageId: info.messageId };

    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email transactionnel:', error);
      throw error;
    }
  }

  // Traiter les campagnes programmées
  async processScheduledCampaigns() {
    try {
      const scheduledCampaigns = await executeQuery(
        'SELECT id FROM email_campaigns WHERE status = "programmé" AND scheduled_at <= NOW()'
      );

      for (const campaign of scheduledCampaigns) {
        console.log(`⏰ Traitement de la campagne programmée ${campaign.id}`);
        
        try {
          await this.sendCampaign(campaign.id);
        } catch (error) {
          console.error(`Erreur traitement campagne ${campaign.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Erreur lors du traitement des campagnes programmées:', error);
    }
  }

  // Vérifier l'état du service email
  async getServiceStatus() {
    try {
      await this.transporter.verify();
      return { status: 'operational', message: 'Service email opérationnel' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// Créer une instance unique du service
const emailService = new EmailService();

// Programmer le traitement des campagnes programmées (toutes les minutes)
setInterval(() => {
  emailService.processScheduledCampaigns();
}, 60000);

module.exports = emailService;