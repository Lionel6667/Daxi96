#!/bin/bash
echo "========================================"
echo "    DAXI - Setup du projet Django"
echo "========================================"


if ! command -v python3 &> /dev/null; then
    echo "ERREUR: Python 3 requis"
    exit 1
fi

echo "[1/6] Création de l'environnement virtuel..."
python3 -m venv venv
source venv/bin/activate

echo "[2/6] Installation des dépendances..."
pip install -r requirements.txt

echo "[3/6] Fichier .env..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "IMPORTANT: Éditez le fichier .env !"
fi

echo "[4/6] Migrations..."
python manage.py makemigrations accounts drivers orders chat notifications forum chatbot admin_panel
python manage.py makemigrations
python manage.py migrate

echo "[5/6] Superutilisateur..."
python manage.py shell -c "
from accounts.models import CustomUser
if not CustomUser.objects.filter(email='admin@daxi.com').exists():
    u = CustomUser.objects.create_superuser('admin', 'admin@daxi.com', 'Admin@Daxi2024')
    u.first_name = 'Admin'; u.last_name = 'DAXI'; u.is_verified = True; u.save()
    print('Admin créé: admin@daxi.com / Admin@Daxi2024')
else:
    print('Admin existe déjà')
"

echo ""
echo "========================================"
echo " Installation terminée !"
echo "========================================"
echo " Démarrer: python manage.py runserver"
echo " URL: http://localhost:8000"
echo " Admin DAXI: http://localhost:8000/admin-dashboard/"
echo " Identifiants: admin@daxi.com / Admin@Daxi2024"
echo ""
