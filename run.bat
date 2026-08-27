@echo off
echo ========================================
echo     DAXI - Demarrage du serveur
echo ========================================
echo.

if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

echo Demarrage du serveur Django sur http://localhost:8000
echo.
echo  Page client  : http://localhost:8000/
echo  Admin DAXI   : http://localhost:8000/admin-dashboard/
echo  Espace chauffeur : http://localhost:8000/driver/
echo  Admin Django : http://localhost:8000/django-admin/
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur.
echo.

python manage.py runserver 0.0.0.0:8000
