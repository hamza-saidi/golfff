const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

// Middleware pour vérifier le token JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token d\'accès requis' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier que l'utilisateur existe toujours et est actif
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = ? AND is_active = true',
      [decoded.id]
    );

    if (user.length === 0) {
      return res.status(401).json({ message: 'Utilisateur non valide' });
    }

    req.user = user[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Token invalide' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ message: 'Token expiré' });
    }
    
    console.error('Erreur d\'authentification:', error);
    return res.status(500).json({ message: 'Erreur serveur lors de l\'authentification' });
  }
};

// Middleware pour vérifier les rôles admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Accès refusé. Droits administrateur requis.' });
  }
  next();
};

// Middleware optionnel - n'échoue pas si pas de token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await executeQuery(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = ? AND is_active = true',
        [decoded.id]
      );

      if (user.length > 0) {
        req.user = user[0];
      }
    }
    
    next();
  } catch (error) {
    // En cas d'erreur, on continue sans utilisateur authentifié
    next();
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth
};