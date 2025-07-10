const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { createObjectCsvStringifier } = require('csv-writer');
const fs = require('fs');
const path = require('path');
const { executeQuery } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configuration de multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers CSV sont autorisés'), false);
    }
  }
});

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Route pour importer des contacts depuis un fichier CSV
router.post('/contacts/import', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    const filePath = req.file.path;
    const filename = req.file.originalname;
    
    // Créer un enregistrement d'import
    const importResult = await executeQuery(
      'INSERT INTO import_history (filename, total_rows, imported_rows, failed_rows, import_type, status, imported_by) VALUES (?, 0, 0, 0, "contacts", "en_cours", ?)',
      [filename, req.user.id]
    );
    
    const importId = importResult.insertId;
    
    const contacts = [];
    const errors = [];
    let rowNumber = 0;

    // Lire le fichier CSV
    const parsePromise = new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({
          separator: ',',
          skipEmptyLines: true,
          headers: ['email', 'first_name', 'last_name', 'phone', 'company', 'position', 'address', 'city', 'postal_code', 'country', 'contact_type', 'tags', 'notes']
        }))
        .on('data', (row) => {
          rowNumber++;
          
          // Ignorer la ligne d'en-tête si c'est du texte
          if (rowNumber === 1 && (row.email === 'email' || row.email === 'Email')) {
            return;
          }

          // Validation basique
          if (!row.email || !row.email.includes('@')) {
            errors.push({
              row: rowNumber,
              email: row.email,
              error: 'Email manquant ou invalide'
            });
            return;
          }

          if (!row.first_name || !row.last_name) {
            errors.push({
              row: rowNumber,
              email: row.email,
              error: 'Prénom ou nom manquant'
            });
            return;
          }

          // Traitement des tags
          let tags = null;
          if (row.tags && row.tags.trim()) {
            try {
              // Si c'est une chaîne séparée par des virgules
              if (typeof row.tags === 'string' && !row.tags.startsWith('[')) {
                tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
              } else {
                tags = JSON.parse(row.tags);
              }
            } catch (e) {
              // Si l'analyse JSON échoue, traiter comme une chaîne simple
              tags = [row.tags.trim()];
            }
          }

          contacts.push({
            email: row.email.toLowerCase().trim(),
            first_name: row.first_name.trim(),
            last_name: row.last_name.trim(),
            phone: row.phone ? row.phone.trim() : null,
            company: row.company ? row.company.trim() : null,
            position: row.position ? row.position.trim() : null,
            address: row.address ? row.address.trim() : null,
            city: row.city ? row.city.trim() : null,
            postal_code: row.postal_code ? row.postal_code.trim() : null,
            country: row.country ? row.country.trim() : 'France',
            contact_type: ['membre', 'visiteur', 'entreprise', 'partenaire'].includes(row.contact_type) ? row.contact_type : 'visiteur',
            tags: tags,
            notes: row.notes ? row.notes.trim() : null
          });
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    await parsePromise;

    // Mettre à jour le nombre total de lignes
    await executeQuery(
      'UPDATE import_history SET total_rows = ? WHERE id = ?',
      [rowNumber, importId]
    );

    let importedCount = 0;
    let failedCount = errors.length;

    // Insérer les contacts valides
    for (const contact of contacts) {
      try {
        // Vérifier si l'email existe déjà
        const existingContact = await executeQuery(
          'SELECT id FROM contacts WHERE email = ?',
          [contact.email]
        );

        if (existingContact.length > 0) {
          // Mettre à jour le contact existant
          await executeQuery(
            `UPDATE contacts SET 
             first_name = ?, last_name = ?, phone = ?, company = ?, position = ?,
             address = ?, city = ?, postal_code = ?, country = ?, contact_type = ?,
             tags = ?, notes = ?, last_interaction = CURDATE()
             WHERE email = ?`,
            [
              contact.first_name, contact.last_name, contact.phone, contact.company,
              contact.position, contact.address, contact.city, contact.postal_code,
              contact.country, contact.contact_type, contact.tags ? JSON.stringify(contact.tags) : null,
              contact.notes, contact.email
            ]
          );
        } else {
          // Créer un nouveau contact
          await executeQuery(
            `INSERT INTO contacts (
              email, first_name, last_name, phone, company, position,
              address, city, postal_code, country, contact_type, tags, notes, last_interaction
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
            [
              contact.email, contact.first_name, contact.last_name, contact.phone,
              contact.company, contact.position, contact.address, contact.city,
              contact.postal_code, contact.country, contact.contact_type,
              contact.tags ? JSON.stringify(contact.tags) : null, contact.notes
            ]
          );
        }
        
        importedCount++;
      } catch (error) {
        failedCount++;
        errors.push({
          email: contact.email,
          error: error.message
        });
      }
    }

    // Mettre à jour l'historique d'import
    await executeQuery(
      'UPDATE import_history SET imported_rows = ?, failed_rows = ?, status = ?, completed_at = NOW(), error_log = ? WHERE id = ?',
      [importedCount, failedCount, 'terminé', JSON.stringify(errors), importId]
    );

    // Supprimer le fichier temporaire
    fs.unlinkSync(filePath);

    res.json({
      message: 'Import terminé',
      imported: importedCount,
      failed: failedCount,
      total: rowNumber,
      errors: errors.slice(0, 10), // Retourner seulement les 10 premières erreurs
      import_id: importId
    });

  } catch (error) {
    console.error('Erreur lors de l\'import:', error);
    
    // Nettoyer le fichier en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Erreur serveur lors de l\'import' });
  }
});

// Route pour exporter tous les contacts en CSV
router.get('/contacts/export', async (req, res) => {
  try {
    const {
      contact_type = '',
      status = '',
      subscription_status = '',
      search = ''
    } = req.query;

    let whereConditions = [];
    let params = [];

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

    if (search) {
      whereConditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const contacts = await executeQuery(
      `SELECT 
        email, first_name, last_name, phone, company, position,
        address, city, postal_code, country, contact_type, status,
        subscription_status, tags, notes, 
        DATE_FORMAT(created_at, '%d/%m/%Y') as date_creation,
        DATE_FORMAT(last_interaction, '%d/%m/%Y') as derniere_interaction
       FROM contacts ${whereClause}
       ORDER BY last_name, first_name`,
      params
    );

    // Préparer les données CSV
    const csvData = contacts.map(contact => ({
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone: contact.phone || '',
      company: contact.company || '',
      position: contact.position || '',
      address: contact.address || '',
      city: contact.city || '',
      postal_code: contact.postal_code || '',
      country: contact.country || '',
      contact_type: contact.contact_type,
      status: contact.status,
      subscription_status: contact.subscription_status,
      tags: contact.tags ? JSON.parse(contact.tags).join(', ') : '',
      notes: contact.notes || '',
      date_creation: contact.date_creation,
      derniere_interaction: contact.derniere_interaction || ''
    }));

    // Configuration CSV
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'email', title: 'Email' },
        { id: 'first_name', title: 'Prénom' },
        { id: 'last_name', title: 'Nom' },
        { id: 'phone', title: 'Téléphone' },
        { id: 'company', title: 'Entreprise' },
        { id: 'position', title: 'Poste' },
        { id: 'address', title: 'Adresse' },
        { id: 'city', title: 'Ville' },
        { id: 'postal_code', title: 'Code Postal' },
        { id: 'country', title: 'Pays' },
        { id: 'contact_type', title: 'Type' },
        { id: 'status', title: 'Statut' },
        { id: 'subscription_status', title: 'Abonnement' },
        { id: 'tags', title: 'Tags' },
        { id: 'notes', title: 'Notes' },
        { id: 'date_creation', title: 'Date Création' },
        { id: 'derniere_interaction', title: 'Dernière Interaction' }
      ]
    });

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvData);

    // Envoyer le fichier CSV
    const filename = `contacts_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
    
    // Ajouter le BOM pour Excel
    res.write('\ufeff');
    res.write(csvContent);
    res.end();

  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'export' });
  }
});

// Route pour obtenir un template CSV d'exemple
router.get('/contacts/template', (req, res) => {
  try {
    const templateData = [
      {
        email: 'exemple@email.com',
        first_name: 'Jean',
        last_name: 'Dupont',
        phone: '0123456789',
        company: 'Entreprise Example',
        position: 'Directeur',
        address: '123 Rue Example',
        city: 'Paris',
        postal_code: '75001',
        country: 'France',
        contact_type: 'membre',
        tags: 'golf, premium',
        notes: 'Contact VIP'
      },
      {
        email: 'marie.martin@example.com',
        first_name: 'Marie',
        last_name: 'Martin',
        phone: '0987654321',
        company: 'Golf Club Pro',
        position: 'Professeur',
        address: '456 Avenue Example',
        city: 'Lyon',
        postal_code: '69001',
        country: 'France',
        contact_type: 'partenaire',
        tags: 'cours, professionnel',
        notes: 'Donne des cours le week-end'
      }
    ];

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'email', title: 'email' },
        { id: 'first_name', title: 'first_name' },
        { id: 'last_name', title: 'last_name' },
        { id: 'phone', title: 'phone' },
        { id: 'company', title: 'company' },
        { id: 'position', title: 'position' },
        { id: 'address', title: 'address' },
        { id: 'city', title: 'city' },
        { id: 'postal_code', title: 'postal_code' },
        { id: 'country', title: 'country' },
        { id: 'contact_type', title: 'contact_type' },
        { id: 'tags', title: 'tags' },
        { id: 'notes', title: 'notes' }
      ]
    });

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(templateData);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_contacts.csv"');
    
    // Ajouter le BOM pour Excel
    res.write('\ufeff');
    res.write(csvContent);
    res.end();

  } catch (error) {
    console.error('Erreur génération template:', error);
    res.status(500).json({ message: 'Erreur lors de la génération du template' });
  }
});

// Route pour obtenir l'historique des imports
router.get('/imports/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Compter le total
    const countResult = await executeQuery(
      'SELECT COUNT(*) as total FROM import_history'
    );
    const total = countResult[0].total;

    // Récupérer l'historique
    const imports = await executeQuery(
      `SELECT 
        ih.*,
        u.first_name as importer_name,
        u.last_name as importer_surname
       FROM import_history ih
       LEFT JOIN users u ON ih.imported_by = u.id
       ORDER BY ih.created_at DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    res.json({
      imports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération historique imports:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération de l\'historique' });
  }
});

// Route pour obtenir les détails d'un import
router.get('/imports/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const imports = await executeQuery(
      `SELECT 
        ih.*,
        u.first_name as importer_name,
        u.last_name as importer_surname
       FROM import_history ih
       LEFT JOIN users u ON ih.imported_by = u.id
       WHERE ih.id = ?`,
      [id]
    );

    if (imports.length === 0) {
      return res.status(404).json({ message: 'Import non trouvé' });
    }

    const importData = imports[0];
    
    // Parser les erreurs si elles existent
    if (importData.error_log) {
      try {
        importData.errors = JSON.parse(importData.error_log);
      } catch (e) {
        importData.errors = [];
      }
    }

    res.json({ import: importData });

  } catch (error) {
    console.error('Erreur récupération détails import:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des détails' });
  }
});

// Route pour valider un fichier CSV avant import
router.post('/contacts/validate', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    const filePath = req.file.path;
    const preview = [];
    const errors = [];
    let rowNumber = 0;
    let validRows = 0;

    // Lire les premières lignes pour aperçu
    const parsePromise = new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({
          separator: ',',
          skipEmptyLines: true,
          headers: ['email', 'first_name', 'last_name', 'phone', 'company', 'position', 'address', 'city', 'postal_code', 'country', 'contact_type', 'tags', 'notes']
        }))
        .on('data', (row) => {
          rowNumber++;
          
          // Ignorer la ligne d'en-tête
          if (rowNumber === 1 && (row.email === 'email' || row.email === 'Email')) {
            return;
          }

          // Validation
          let isValid = true;
          const rowErrors = [];

          if (!row.email || !row.email.includes('@')) {
            rowErrors.push('Email manquant ou invalide');
            isValid = false;
          }

          if (!row.first_name || !row.last_name) {
            rowErrors.push('Prénom ou nom manquant');
            isValid = false;
          }

          if (isValid) {
            validRows++;
          } else {
            errors.push({
              row: rowNumber,
              email: row.email,
              errors: rowErrors
            });
          }

          // Ajouter à l'aperçu (max 5 lignes)
          if (preview.length < 5) {
            preview.push({
              ...row,
              valid: isValid,
              errors: rowErrors
            });
          }

          // Limiter l'analyse pour la validation
          if (rowNumber >= 100) {
            resolve();
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    await parsePromise;

    // Supprimer le fichier temporaire
    fs.unlinkSync(filePath);

    res.json({
      preview,
      total_rows: rowNumber,
      valid_rows: validRows,
      invalid_rows: errors.length,
      errors: errors.slice(0, 10), // Max 10 erreurs pour l'aperçu
      ready_for_import: errors.length === 0
    });

  } catch (error) {
    console.error('Erreur validation CSV:', error);
    
    // Nettoyer le fichier en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Erreur serveur lors de la validation' });
  }
});

module.exports = router;