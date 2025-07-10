# 🏌️ Club CRM - Plateforme de Gestion des Contacts et Email Marketing

Une solution complète de CRM et d'email marketing spécialement conçue pour les clubs de golf, offrant une gestion avancée des contacts et des outils puissants de communication.

## 🚀 Fonctionnalités Principales

### 📋 Gestion des Contacts
- **Base de données complète** : Stockage de tous types de contacts (membres, visiteurs, entreprises, partenaires)
- **Fiches détaillées** : Coordonnées, historique d'interactions, préférences, statuts
- **Recherche avancée** : Filtres multiples pour retrouver rapidement n'importe quel contact
- **Import/Export** : Support CSV et Excel pour l'import et l'export de données
- **Segmentation dynamique** : Création de groupes selon des critères variés

### 📧 Email Marketing Intégré
- **Création de campagnes** : Éditeur de contenu avec templates personnalisables
- **Ciblage précis** : Sélection de segments spécifiques selon le type, activité, historique
- **Automatisation** : Programmation d'envois pour newsletters, invitations, rappels
- **Suivi complet** : Taux d'ouverture, clics, désabonnements en temps réel
- **Tracking avancé** : Pixel de tracking et liens trackés pour mesurer l'engagement

### 📊 Analytics et Reporting
- **Dashboard interactif** : Vue d'ensemble des performances en temps réel
- **Statistiques détaillées** : Par campagne, par segment, par période
- **Graphiques évolutifs** : Visualisation des tendances et performances
- **Export de données** : Rapports personnalisables en CSV

## 🛠️ Technologies Utilisées

### Backend
- **Node.js** + **Express.js** - API REST
- **MySQL** - Base de données relationnelle
- **JWT** - Authentification sécurisée
- **Nodemailer** - Service d'envoi d'emails
- **Multer** - Upload de fichiers
- **Bcrypt** - Chiffrement des mots de passe

### Frontend
- **React 18** - Interface utilisateur moderne
- **React Router** - Navigation SPA
- **React Query** - Gestion d'état serveur
- **Tailwind CSS** - Styles utilitaires
- **Chart.js** - Visualisations de données
- **Lucide React** - Icônes modernes

## 📦 Installation

### Prérequis
- **Node.js** (version 16 ou supérieure)
- **MySQL** (version 8 ou supérieure)
- **npm** ou **yarn**

### 1. Cloner le projet
```bash
git clone [url-du-repo]
cd contact-email-marketing-platform
```

### 2. Installer les dépendances
```bash
# Installation globale et des sous-projets
npm run setup
```

### 3. Configuration de la base de données

#### Créer la base de données MySQL
```sql
CREATE DATABASE contact_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### Configurer les variables d'environnement
Copiez le fichier `.env.example` vers `.env` dans le dossier `server/` :

```bash
cd server
cp .env.example .env
```

Modifiez le fichier `.env` avec vos paramètres :

```env
# Configuration Base de données
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
DB_NAME=contact_crm
DB_PORT=3306

# Configuration JWT
JWT_SECRET=votre_clé_secrète_jwt_très_sécurisée
JWT_EXPIRES_IN=7d

# Configuration Email (Gmail recommandé)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-application

# Configuration Serveur
PORT=5000
NODE_ENV=development

# Configuration Frontend
CLIENT_URL=http://localhost:3000
```

### 4. Initialiser la base de données
```bash
npm run db:setup
```

Cette commande va :
- Créer toutes les tables nécessaires
- Insérer des données de démo
- Créer un utilisateur admin par défaut

### 5. Lancer l'application

#### Développement (Backend + Frontend)
```bash
npm run dev
```

#### Ou séparément
```bash
# Backend (port 5000)
npm run server

# Frontend (port 3000)
npm run client
```

## 🔐 Accès par Défaut

Une fois l'installation terminée, vous pouvez vous connecter avec :

- **URL** : http://localhost:3000
- **Email** : admin@golfclub.com
- **Mot de passe** : admin123

## 📱 Utilisation

### Gestion des Contacts

1. **Ajouter des contacts** :
   - Manuellement via le formulaire
   - Import en masse avec un fichier CSV
   - Utilisation du template fourni

2. **Organiser les contacts** :
   - Filtrage par type, statut, abonnement
   - Création de groupes personnalisés
   - Tags pour une classification flexible

3. **Recherche et segmentation** :
   - Recherche globale instantanée
   - Filtres avancés combinables
   - Autocomplétion intelligente

### Campagnes Email

1. **Créer une campagne** :
   - Rédiger le contenu avec l'éditeur
   - Sélectionner les destinataires
   - Programmer l'envoi si nécessaire

2. **Personnalisation** :
   - Variables dynamiques : {first_name}, {company}, etc.
   - Templates prédéfinis
   - Aperçu avant envoi

3. **Suivi des performances** :
   - Statistiques en temps réel
   - Tracking des ouvertures et clics
   - Gestion des désabonnements

### Import/Export

1. **Import de contacts** :
   - Télécharger le template CSV
   - Remplir avec vos données
   - Valider et importer

2. **Export de données** :
   - Export contacts avec filtres
   - Export statistiques campagnes
   - Formats CSV compatibles Excel

## 🔧 Configuration Avancée

### Configuration Email

Pour utiliser Gmail :
1. Activez l'authentification à 2 facteurs
2. Générez un mot de passe d'application
3. Utilisez ce mot de passe dans `SMTP_PASS`

### Variables d'environnement complètes

```env
# Base de données
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=contact_crm
DB_PORT=3306

# Authentification
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Serveur
PORT=5000
NODE_ENV=development

# Client
CLIENT_URL=http://localhost:3000
```

## 🗄️ Structure de la Base de Données

### Tables Principales

- **users** : Utilisateurs de l'application
- **contacts** : Base de données des contacts
- **contact_groups** : Groupes de segmentation
- **email_campaigns** : Campagnes d'email marketing
- **campaign_recipients** : Destinataires par campagne
- **email_interactions** : Tracking des interactions
- **email_templates** : Templates d'emails
- **import_history** : Historique des imports

## 🔌 API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion
- `GET /api/auth/profile` - Profil utilisateur
- `PUT /api/auth/profile` - Mise à jour profil

### Contacts
- `GET /api/contacts` - Liste des contacts
- `POST /api/contacts` - Créer un contact
- `PUT /api/contacts/:id` - Modifier un contact
- `DELETE /api/contacts/:id` - Supprimer un contact
- `GET /api/contacts/stats/overview` - Statistiques

### Campagnes
- `GET /api/campaigns` - Liste des campagnes
- `POST /api/campaigns` - Créer une campagne
- `POST /api/campaigns/:id/send` - Envoyer une campagne
- `GET /api/campaigns/:id/recipients` - Destinataires

### Analytics
- `GET /api/analytics/dashboard` - Tableau de bord
- `GET /api/analytics/campaign/:id` - Stats campagne
- `GET /api/analytics/export/:id` - Export données

## 🚀 Déploiement

### Production avec PM2

1. **Installer PM2** :
```bash
npm install -g pm2
```

2. **Build du frontend** :
```bash
npm run build
```

3. **Lancer avec PM2** :
```bash
pm2 start server/index.js --name "crm-api"
pm2 startup
pm2 save
```

### Variables d'environnement production

```env
NODE_ENV=production
JWT_SECRET=clé_secrète_très_forte_en_production
SMTP_HOST=votre-smtp-professionnel
CLIENT_URL=https://votre-domaine.com
```

## 🤝 Contribution

1. Fork le projet
2. Créez votre branche (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Committez vos changements (`git commit -m 'Ajout nouvelle fonctionnalité'`)
4. Push vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

- **Documentation** : Consultez ce README
- **Issues** : Ouvrez une issue sur GitHub
- **Email** : contact@exemple.com

## 🎯 Roadmap

- [ ] Templates d'emails avancés
- [ ] Intégration calendrier
- [ ] Application mobile
- [ ] API webhooks
- [ ] Intégrations tiers (Mailchimp, etc.)
- [ ] Système de notifications push
- [ ] Gestion multi-langues

---

**Développé avec ❤️ pour optimiser la gestion des contacts et la communication des clubs de golf.**