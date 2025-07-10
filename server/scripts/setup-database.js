const mysql = require('mysql2');
require('dotenv').config();

// Connexion sans spécifier la base de données pour la créer
const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306
});

const dbName = process.env.DB_NAME || 'contact_crm';

const setupDatabase = async () => {
  try {
    console.log('🚀 Début du setup de la base de données...');

    // Créer la base de données si elle n'existe pas
    await connection.promise().execute(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Base de données "${dbName}" créée ou vérifiée`);

    // Se connecter à la base de données
    await connection.promise().execute(`USE ${dbName}`);

    // Table des utilisateurs
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table "users" créée');

    // Table des contacts
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        company VARCHAR(200),
        position VARCHAR(200),
        address TEXT,
        city VARCHAR(100),
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'France',
        contact_type ENUM('membre', 'visiteur', 'entreprise', 'partenaire') DEFAULT 'visiteur',
        status ENUM('actif', 'inactif', 'bloqué') DEFAULT 'actif',
        subscription_status ENUM('abonné', 'désabonné') DEFAULT 'abonné',
        tags JSON,
        notes TEXT,
        last_interaction DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_contact_type (contact_type),
        INDEX idx_status (status),
        INDEX idx_subscription (subscription_status)
      )
    `);
    console.log('✅ Table "contacts" créée');

    // Table des groupes/segments
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS contact_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        criteria JSON,
        is_dynamic BOOLEAN DEFAULT false,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Table "contact_groups" créée');

    // Table de liaison contacts-groupes
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS contact_group_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        group_id INT NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE,
        UNIQUE KEY unique_contact_group (contact_id, group_id)
      )
    `);
    console.log('✅ Table "contact_group_members" créée');

    // Table des templates d'email
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        html_content LONGTEXT NOT NULL,
        text_content LONGTEXT,
        template_type ENUM('newsletter', 'invitation', 'rappel', 'personnalisé') DEFAULT 'personnalisé',
        is_active BOOLEAN DEFAULT true,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Table "email_templates" créée');

    // Table des campagnes email
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        html_content LONGTEXT NOT NULL,
        text_content LONGTEXT,
        sender_name VARCHAR(200),
        sender_email VARCHAR(255),
        status ENUM('brouillon', 'programmé', 'envoyé', 'annulé') DEFAULT 'brouillon',
        scheduled_at TIMESTAMP NULL,
        sent_at TIMESTAMP NULL,
        recipient_count INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        delivered_count INT DEFAULT 0,
        opened_count INT DEFAULT 0,
        clicked_count INT DEFAULT 0,
        unsubscribed_count INT DEFAULT 0,
        bounced_count INT DEFAULT 0,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_status (status),
        INDEX idx_scheduled (scheduled_at)
      )
    `);
    console.log('✅ Table "email_campaigns" créée');

    // Table des destinataires de campagne
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS campaign_recipients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id INT NOT NULL,
        contact_id INT NOT NULL,
        status ENUM('en_attente', 'envoyé', 'délivré', 'ouvert', 'cliqué', 'echec', 'désabonné') DEFAULT 'en_attente',
        sent_at TIMESTAMP NULL,
        delivered_at TIMESTAMP NULL,
        opened_at TIMESTAMP NULL,
        clicked_at TIMESTAMP NULL,
        unsubscribed_at TIMESTAMP NULL,
        bounce_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_campaign_contact (campaign_id, contact_id),
        INDEX idx_campaign_status (campaign_id, status)
      )
    `);
    console.log('✅ Table "campaign_recipients" créée');

    // Table des interactions (tracking)
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS email_interactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id INT NOT NULL,
        contact_id INT NOT NULL,
        interaction_type ENUM('ouverture', 'clic', 'désabonnement', 'bounce') NOT NULL,
        interaction_data JSON,
        user_agent TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        INDEX idx_campaign_interaction (campaign_id, interaction_type),
        INDEX idx_contact_interaction (contact_id, interaction_type)
      )
    `);
    console.log('✅ Table "email_interactions" créée');

    // Table d'historique des imports
    await connection.promise().execute(`
      CREATE TABLE IF NOT EXISTS import_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(500) NOT NULL,
        total_rows INT NOT NULL,
        imported_rows INT NOT NULL,
        failed_rows INT NOT NULL,
        import_type ENUM('contacts', 'groupes') DEFAULT 'contacts',
        status ENUM('en_cours', 'terminé', 'échec') DEFAULT 'en_cours',
        error_log LONGTEXT,
        imported_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Table "import_history" créée');

    // Insérer un utilisateur admin par défaut
    const hashedPassword = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2UWdl12/6K'; // password: admin123
    await connection.promise().execute(`
      INSERT IGNORE INTO users (email, password, first_name, last_name, role) 
      VALUES ('admin@golfclub.com', ?, 'Admin', 'Système', 'admin')
    `, [hashedPassword]);
    console.log('✅ Utilisateur admin créé (email: admin@golfclub.com, password: admin123)');

    // Insérer quelques templates par défaut
    await connection.promise().execute(`
      INSERT IGNORE INTO email_templates (name, subject, html_content, text_content, template_type, created_by) 
      VALUES 
      ('Newsletter Club', 'Newsletter #{date} - Club de Golf', 
       '<html><body><h1>Newsletter du Club</h1><p>Bonjour {first_name},</p><p>Voici les dernières nouvelles de notre club...</p></body></html>',
       'Newsletter du Club\\n\\nBonjour {first_name},\\n\\nVoici les dernières nouvelles de notre club...',
       'newsletter', 1),
      ('Invitation Événement', 'Invitation - {event_name}', 
       '<html><body><h1>Vous êtes invité(e)</h1><p>Cher(e) {first_name},</p><p>Nous avons le plaisir de vous inviter à {event_name}...</p></body></html>',
       'Vous êtes invité(e)\\n\\nCher(e) {first_name},\\n\\nNous avons le plaisir de vous inviter à {event_name}...',
       'invitation', 1)
    `);
    console.log('✅ Templates par défaut créés');

    console.log('🎉 Setup de la base de données terminé avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur lors du setup:', error);
  } finally {
    connection.end();
  }
};

// Exécuter le setup
setupDatabase();