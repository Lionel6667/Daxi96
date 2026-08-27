@echo off

echo ================================================
echo Configuration du Watcher Firebase - Daxi
echo ================================================
echo.

set PHP_PATH=C:\xampp\php\php.exe

set SCRIPT_PATH=C:\xampp\htdocs\dashboard\phpscript\firebase_order_watcher.php

if not exist "%PHP_PATH%" (
    echo ERREUR: PHP introuvable à %PHP_PATH%
    echo Veuillez modifier PHP_PATH dans ce script.
    pause
    exit /b 1
)

if not exist "%SCRIPT_PATH%" (
    echo ERREUR: Script watcher introuvable à %SCRIPT_PATH%
    echo Veuillez modifier SCRIPT_PATH dans ce script.
    pause
    exit /b 1
)

echo Configuration détectée:
echo - PHP: %PHP_PATH%
echo - Script: %SCRIPT_PATH%
echo.

echo Suppression de l'ancienne tâche (si existante)...
schtasks /Delete /TN "DaxiFirebaseWatcher" /F >nul 2>&1

echo Création de la tâche planifiée...
schtasks /Create /TN "DaxiFirebaseWatcher" /TR "\"%PHP_PATH%\" \"%SCRIPT_PATH%\"" /SC MINUTE /MO 1 /F /RL HIGHEST

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================
    echo SUCCES! Tâche configurée avec succès
    echo ================================================
    echo.
    echo La tâche "DaxiFirebaseWatcher" s'exécutera:
    echo - Toutes les minutes
    echo - En arrière-plan
    echo - Même si personne n'est connecté au site
    echo.
    echo Pour vérifier: Planificateur de tâches ^> DaxiFirebaseWatcher
    echo Pour désactiver: schtasks /End /TN "DaxiFirebaseWatcher"
    echo Pour supprimer: schtasks /Delete /TN "DaxiFirebaseWatcher" /F
    echo.
    echo Logs disponibles dans:
    echo - watcher_errors.log (erreurs)
    echo - sent_emails.json (emails envoyés)
    echo.
) else (
    echo.
    echo ERREUR lors de la création de la tâche!
    echo Assurez-vous d'exécuter ce script en tant qu'administrateur.
    echo.
)

pause
