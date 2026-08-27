#!/bin/bash


echo "================================================"
echo "Installation Système Emails Automatiques - Daxi"
echo "================================================"
echo ""


GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' 


success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "ℹ $1"
}


if command -v php &> /dev/null; then
    PHP_PATH=$(which php)
    success "PHP trouvé: $PHP_PATH"
    php -v | head -n 1
else
    error "PHP non trouvé! Installer PHP d'abord."
    exit 1
fi

echo ""


SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WATCHER_SCRIPT="$SCRIPT_DIR/firebase_order_watcher.php"

info "Répertoire d'installation: $SCRIPT_DIR"

if [ ! -f "$WATCHER_SCRIPT" ]; then
    error "Script watcher non trouvé: $WATCHER_SCRIPT"
    exit 1
fi

success "Script watcher trouvé"
echo ""


if [ -d "$SCRIPT_DIR/vendor/phpmailer" ]; then
    success "PHPMailer installé"
else
    warning "PHPMailer non trouvé. Installation avec Composer..."
    if command -v composer &> /dev/null; then
        cd "$SCRIPT_DIR"
        composer require phpmailer/phpmailer
        success "PHPMailer installé"
    else
        error "Composer non trouvé. Installer manuellement PHPMailer"
        info "Télécharger: https://github.com/PHPMailer/PHPMailer"
        exit 1
    fi
fi

echo ""


if [ ! -f "$SCRIPT_DIR/config_smtp.php" ]; then
    warning "config_smtp.php non trouvé"
    if [ -f "$SCRIPT_DIR/config_smtp.example.php" ]; then
        cp "$SCRIPT_DIR/config_smtp.example.php" "$SCRIPT_DIR/config_smtp.php"
        warning "Fichier config_smtp.php créé depuis l'exemple"
        error "IMPORTANT: Éditer config_smtp.php avec vos vraies informations SMTP"
    else
        error "Créer config_smtp.php avec vos informations SMTP"
        exit 1
    fi
else
    success "config_smtp.php trouvé"
fi

echo ""


if [ -w "$SCRIPT_DIR" ]; then
    success "Permissions d'écriture OK"
else
    error "Pas de permission d'écriture dans $SCRIPT_DIR"
    info "Exécuter: sudo chmod -R 755 $SCRIPT_DIR"
    exit 1
fi

echo ""


if [ ! -f "$SCRIPT_DIR/sent_emails.json" ]; then
    echo "{}" > "$SCRIPT_DIR/sent_emails.json"
    chmod 666 "$SCRIPT_DIR/sent_emails.json"
    success "Fichier sent_emails.json créé"
fi

echo ""
echo "================================================"
echo "Configuration du Cron Job"
echo "================================================"
echo ""


CRON_COMMAND="* * * * * $PHP_PATH $WATCHER_SCRIPT >> $SCRIPT_DIR/watcher_output.log 2>&1"

info "Commande cron à ajouter:"
echo "$CRON_COMMAND"
echo ""


read -p "Voulez-vous ajouter cette tâche cron maintenant? (o/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Oo]$ ]]; then
    
    (crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -
    
    if [ $? -eq 0 ]; then
        success "Tâche cron ajoutée avec succès!"
        echo ""
        info "La tâche s'exécutera toutes les minutes"
    else
        error "Erreur lors de l'ajout de la tâche cron"
        info "Ajouter manuellement avec: crontab -e"
    fi
else
    warning "Tâche cron non ajoutée"
    info "Pour ajouter manuellement:"
    echo "  1. Exécuter: crontab -e"
    echo "  2. Ajouter la ligne:"
    echo "     $CRON_COMMAND"
fi

echo ""
echo "================================================"
echo "Test du Système"
echo "================================================"
echo ""

info "Exécution de test..."
$PHP_PATH "$WATCHER_SCRIPT"

echo ""
echo "================================================"
echo "Installation Terminée!"
echo "================================================"
echo ""

success "Le système d'emails automatiques est installé"
echo ""
info "Vérifications finales:"
echo "  1. Éditer config_smtp.php avec vos informations SMTP"
echo "  2. Éditer firebase_order_watcher.php ligne 19 avec votre Firebase Secret"
echo "  3. Vérifier le dashboard: http://votre-domaine/phpscript/email_dashboard.html"
echo ""
info "Commandes utiles:"
echo "  - Voir cron actifs: crontab -l"
echo "  - Éditer cron: crontab -e"
echo "  - Supprimer cron: crontab -r"
echo "  - Logs: tail -f $SCRIPT_DIR/watcher_output.log"
echo "  - Emails envoyés: cat $SCRIPT_DIR/sent_emails.json"
echo ""

success "Installation complète! 🚀"
