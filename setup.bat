@echo off
echo ========================================
echo     DAXI - Setup du projet Django
echo ========================================
echo.

python --version 2>NUL
if errorlevel 1 (
    echo ERREUR: Python n'est pas installe. Installez Python 3.10+ depuis python.org
    pause
    exit /b 1
)

echo [1/6] Creation de l'environnement virtuel...
python -m venv venv
call venv\Scripts\activate.bat

echo [2/6] Installation des dependances...
pip install -r requirements.txt

echo [3/6] Copie du fichier .env...
if not exist .env (
    copy .env.example .env
    echo IMPORTANT: Editez le fichier .env avec vos parametres !
)

echo [4/6] Creation des migrations...
python manage.py makemigrations accounts drivers orders chat notifications forum chatbot firebase_db
python manage.py makemigrations

echo [5/6] Application des migrations...
python manage.py migrate

echo [6/6] Creation du superutilisateur admin...
python manage.py shell -c "
from accounts.models import CustomUser
if not CustomUser.objects.filter(email='admin@daxi.com').exists():
    u = CustomUser.objects.create_superuser('admin', 'admin@daxi.com', 'Admin@Daxi2024')
    u.first_name = 'Admin'
    u.last_name = 'DAXI'
    u.is_driver = False
    u.is_verified = True
    u.save()
    print('Superuser cree: admin@daxi.com / Admin@Daxi2024')
else:
    print('Superuser existe deja')
"

echo.
echo ========================================
echo  Installation terminee !
echo ========================================
echo.
echo  Demarrer le serveur: python manage.py runserver
echo  Acces: http://localhost:8000
echo  Admin Django: http://localhost:8000/django-admin/
echo  Dashboard admin DAXI: http://localhost:8000/admin-dashboard/
echo  Identifiants admin: admin@daxi.com / Admin@Daxi2024
echo.
echo  N'oubliez pas d'editer .env avec vos cles API !
echo  Verifier les chemins: python manage.py validate_project_paths
echo.
pause
