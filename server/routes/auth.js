const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Générer un token JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Route de connexion
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Email valide requis'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe requis (min 6 caractères)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Données invalides', 
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Vérifier si l'utilisateur existe
    const users = await executeQuery(
      'SELECT * FROM users WHERE email = ? AND is_active = true',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const user = users[0];

    // Vérifier le mot de passe
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    // Générer le token
    const token = generateToken(user);

    // Retourner les données sans le mot de passe
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Connexion réussie',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la connexion' });
  }
});

// Route d'inscription (admin uniquement)
router.post('/register', authenticateToken, requireAdmin, [
  body('email').isEmail().normalizeEmail().withMessage('Email valide requis'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe requis (min 6 caractères)'),
  body('first_name').trim().isLength({ min: 1 }).withMessage('Prénom requis'),
  body('last_name').trim().isLength({ min: 1 }).withMessage('Nom requis'),
  body('role').optional().isIn(['admin', 'user']).withMessage('Rôle invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Données invalides', 
        errors: errors.array() 
      });
    }

    const { email, password, first_name, last_name, role = 'user' } = req.body;

    // Vérifier si l'email existe déjà
    const existingUsers = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    // Hasher le mot de passe
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Créer l'utilisateur
    const result = await executeQuery(
      'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, first_name, last_name, role]
    );

    // Récupérer l'utilisateur créé sans le mot de passe
    const newUser = await executeQuery(
      'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: newUser[0]
    });

  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'inscription' });
  }
});

// Route pour obtenir le profil utilisateur actuel
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (user.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json({ user: user[0] });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération du profil' });
  }
});

// Route pour mettre à jour le profil
router.put('/profile', authenticateToken, [
  body('first_name').optional().trim().isLength({ min: 1 }).withMessage('Prénom invalide'),
  body('last_name').optional().trim().isLength({ min: 1 }).withMessage('Nom invalide'),
  body('current_password').optional().isLength({ min: 6 }).withMessage('Mot de passe actuel requis'),
  body('new_password').optional().isLength({ min: 6 }).withMessage('Nouveau mot de passe invalide (min 6 caractères)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Données invalides', 
        errors: errors.array() 
      });
    }

    const { first_name, last_name, current_password, new_password } = req.body;
    const updates = [];
    const values = [];

    // Mise à jour des informations de base
    if (first_name) {
      updates.push('first_name = ?');
      values.push(first_name);
    }
    if (last_name) {
      updates.push('last_name = ?');
      values.push(last_name);
    }

    // Changement de mot de passe
    if (new_password && current_password) {
      // Vérifier le mot de passe actuel
      const user = await executeQuery(
        'SELECT password FROM users WHERE id = ?',
        [req.user.id]
      );

      const isValidPassword = await bcrypt.compare(current_password, user[0].password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
      }

      const hashedPassword = await bcrypt.hash(new_password, 12);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    values.push(req.user.id);

    await executeQuery(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Récupérer les données mises à jour
    const updatedUser = await executeQuery(
      'SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      user: updatedUser[0]
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du profil:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour du profil' });
  }
});

// Route pour lister tous les utilisateurs (admin uniquement)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (search) {
      whereClause = 'WHERE (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      params = [searchTerm, searchTerm, searchTerm];
    }

    // Compter le total
    const countResult = await executeQuery(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Récupérer les utilisateurs
    const users = await executeQuery(
      `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at 
       FROM users ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des utilisateurs' });
  }
});

// Route pour activer/désactiver un utilisateur (admin uniquement)
router.patch('/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    // Empêcher la désactivation de son propre compte
    if (parseInt(id) === req.user.id && !is_active) {
      return res.status(400).json({ message: 'Vous ne pouvez pas désactiver votre propre compte' });
    }

    await executeQuery(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [is_active, id]
    );

    res.json({ 
      message: `Utilisateur ${is_active ? 'activé' : 'désactivé'} avec succès` 
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour du statut' });
  }
});

// Route de vérification du token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ 
    valid: true, 
    user: req.user 
  });
});

module.exports = router;