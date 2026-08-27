import os
from decimal import Decimal
from pathlib import Path
from datetime import timedelta

                                                                
BASE_DIR = Path(__file__).resolve().parent.parent

                             
from dotenv import load_dotenv
load_dotenv(BASE_DIR / '.env', override=True)

# Railway (and similar) → production defaults: DEBUG off, brand hosts allowed.
_ON_RAILWAY = bool(
    os.environ.get('RAILWAY_ENVIRONMENT')
    or os.environ.get('RAILWAY_PUBLIC_DOMAIN')
    or os.environ.get('RAILWAY_PROJECT_ID')
)
_DEBUG_DEFAULT = 'False' if _ON_RAILWAY else 'True'


def _env_is_debug() -> bool:
    return os.environ.get('DEBUG', _DEBUG_DEFAULT) == 'True'


SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-change-this-in-production-julmin-taxis-daxi')
if not os.environ.get('SECRET_KEY') and not _env_is_debug() and not _ON_RAILWAY:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured('SECRET_KEY must be set in environment when DEBUG=False')

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')
ADMIN_PASSWORD_LEGACY = os.environ.get('ADMIN_PASSWORD_LEGACY', '')
FINANCE_WITHDRAWAL_DUAL_APPROVAL_MIN = Decimal(os.environ.get('FINANCE_WITHDRAWAL_DUAL_APPROVAL_MIN', '5000'))
if not _env_is_debug() and not ADMIN_PASSWORD and not _ON_RAILWAY:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured('ADMIN_PASSWORD must be set in environment when DEBUG=False')

_site_default = (
    f"https://{(os.environ.get('RAILWAY_PUBLIC_DOMAIN') or 'daxipro.com').strip()}"
    if _ON_RAILWAY
    else 'http://localhost:8000'
)
SITE_URL = os.environ.get('SITE_URL', _site_default)

                                                                                
TRANSAK_API_KEY     = os.environ.get('TRANSAK_API_KEY', '')
TRANSAK_API_SECRET  = os.environ.get('TRANSAK_API_SECRET', '')
                                                                                
TRANSAK_WALLET_ADDRESS = os.environ.get('TRANSAK_WALLET_ADDRESS', '')
                       
TRANSAK_ENVIRONMENT = os.environ.get('TRANSAK_ENVIRONMENT', 'STAGING')

                                                                                
ADMIN_MONCASH_PHONE = os.environ.get('ADMIN_MONCASH_PHONE', '+509 4000-0000')

                                                                              
MONCASH_CONNECT_SECRET_KEY = os.environ.get('MONCASH_CONNECT_SECRET_KEY', '')
MONCASH_CONNECT_WEBHOOK_SECRET = os.environ.get('MONCASH_CONNECT_WEBHOOK_SECRET', '')
MONCASH_CONNECT_BASE_URL = os.environ.get(
    'MONCASH_CONNECT_BASE_URL',
    'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1',
)

                                                                              
HATEXCARD_API_KEY = os.environ.get('HATEXCARD_API_KEY', '')
HATEXCARD_WEBHOOK_SECRET = os.environ.get('HATEXCARD_WEBHOOK_SECRET', '')
ADMIN_WHATSAPP_PHONES = os.environ.get('ADMIN_WHATSAPP_PHONES', '')
                                                                                     
ADMIN_FCM_TOKENS = os.environ.get('ADMIN_FCM_TOKENS', '')

                                                                               
CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY', '')
CLOUDINARY_API_SECRET = (
    os.environ.get('CLOUDINARY_API_SECRET', '')
    or os.environ.get('CLOUDINARY_SECRET', '')  
)

                                                                                
_wa_verify = os.environ.get('WHATSAPP_VERIFY_TOKEN', '').strip()
if not _wa_verify and (_env_is_debug() or _ON_RAILWAY):
    _wa_verify = 'daxi_verify_2026'
if not _env_is_debug() and not _wa_verify and not _ON_RAILWAY:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured('WHATSAPP_VERIFY_TOKEN must be set in environment when DEBUG=False')
WHATSAPP_VERIFY_TOKEN = _wa_verify
WHATSAPP_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', '')
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
WHATSAPP_WABA_ID = os.environ.get('WHATSAPP_WABA_ID', '')
WHATSAPP_TEMPLATE_LANG = os.environ.get('WHATSAPP_TEMPLATE_LANG', 'fr')
                                                                        
WHATSAPP_TEMPLATES = {
    k: os.environ.get(env_key, '')
    for k, env_key in {
        'nouvelle_commande': 'WA_TPL_NOUVELLE_COMMANDE',
        'prix_propose': 'WA_TPL_PRIX_PROPOSE',
        'chauffeur_assigne': 'WA_TPL_CHAUFFEUR_ASSIGNE',
        'chauffeur_en_route': 'WA_TPL_CHAUFFEUR_EN_ROUTE',
        'chauffeur_arrive': 'WA_TPL_CHAUFFEUR_ARRIVE',
        'course_demarree': 'WA_TPL_COURSE_DEMARREE',
        'course_terminee': 'WA_TPL_COURSE_TERMINEE',
        'recu_course': 'WA_TPL_RECU',
        'pause_course': 'WA_TPL_PAUSE',
        'rappel_course': 'WA_TPL_RAPPEL',
        'otp_whatsapp': 'WA_TPL_OTP',
        'welcome_client': 'WA_TPL_WELCOME_CLIENT',
        'chauffeur_valide': 'WA_TPL_CHAUFFEUR_VALIDE',
        'course_terminer_chauffeur': 'WA_TPL_COURSE_TERMINER_CHAUFFEUR',
        'commande_entreprise': 'WA_TPL_COMMANDE_ENTREPRISE',
        'demande_paiment': 'WA_TPL_DEMANDE_PAIMENT',
        'sos_client': 'WA_TPL_SOS_CLIENT',
        'sos_admin': 'WA_TPL_SOS_ADMIN',
        'nouvelle_commande_admin': 'WA_TPL_NOUVELLE_COMMANDE_ADMIN',
        'objet_oublie_admin': 'WA_TPL_OBJET_OUBLIE_ADMIN',
        'entreprise_en_attente': 'WA_TPL_ENTREPRISE_EN_ATTENTE',
        'entreprise_emplacement': 'WA_TPL_ENTREPRISE_EMPLACEMENT',
        'chat_escalade': 'WA_TPL_CHAT_ESCALADE',
        'chauffeur_a_valider': 'WA_TPL_CHAUFFEUR_A_VALIDER',
        'course_annulee': 'WA_TPL_COURSE_ANNULEE',
        'prix_confirme': 'WA_TPL_PRIX_CONFIRME',
    }.items()
    if os.environ.get(env_key, '').strip()
}
                                                                               

                                                                 
DEBUG = _env_is_debug()

_allowed_default = 'localhost,127.0.0.1,daxipro.com,www.daxipro.com'
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get('ALLOWED_HOSTS', _allowed_default).split(',')
    if h.strip()
]
for _host in (
    'daxipro.com',
    'www.daxipro.com',
    '.up.railway.app',
    '.railway.app',
):
    if _host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_host)
_railway_domain = (os.environ.get('RAILWAY_PUBLIC_DOMAIN') or '').strip()
if _railway_domain and _railway_domain not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_railway_domain)
if DEBUG:
    for _ngrok_host in ('.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'):
        if _ngrok_host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_ngrok_host)

                                                      
X_FRAME_OPTIONS = 'SAMEORIGIN'

def _parse_database_url(url: str) -> dict:
    """Parse postgres:// / postgresql:// / postgis:// (Railway DATABASE_URL)."""
    from urllib.parse import parse_qs, unquote, urlparse
    u = urlparse(url.strip())
    scheme = (u.scheme or '').lower()
    if scheme not in ('postgres', 'postgresql', 'postgis'):
        raise ValueError(f'Unsupported DATABASE_URL scheme: {scheme}')
    use_postgis = scheme == 'postgis' or os.environ.get('DATABASE_ENGINE', '').lower() == 'postgis'
    path = (u.path or '').lstrip('/')
    cfg = {
        'ENGINE': (
            'django.contrib.gis.db.backends.postgis'
            if use_postgis
            else 'django.db.backends.postgresql'
        ),
        'NAME': unquote(path) or os.environ.get('POSTGRES_DB', 'daxi'),
        'USER': unquote(u.username or '') or os.environ.get('POSTGRES_USER', 'daxi'),
        'PASSWORD': unquote(u.password or '') or os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': u.hostname or os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': str(u.port or os.environ.get('POSTGRES_PORT', '5432')),
        'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '60') or '60'),
    }
    qs = parse_qs(u.query or '')
    sslmode = (qs.get('sslmode') or [None])[0] or os.environ.get('POSTGRES_SSLMODE', '')
    if not sslmode and os.environ.get('RAILWAY_ENVIRONMENT'):
        sslmode = 'require'
    if sslmode:
        cfg['OPTIONS'] = {'sslmode': sslmode}
    return cfg


_DATABASE_URL = (os.environ.get('DATABASE_URL') or '').strip()
_DATABASE_ENGINE = os.environ.get('DATABASE_ENGINE', '').lower().strip()
if not _DATABASE_ENGINE:
    if _DATABASE_URL:
        _DATABASE_ENGINE = 'postgis' if _DATABASE_URL.startswith('postgis://') else 'postgresql'
    else:
        _DATABASE_ENGINE = 'sqlite'
# PostGIS = moteur GIS réel. Plain PostgreSQL (Railway) = pas d'extension PostGIS requise.
USE_POSTGIS = _DATABASE_ENGINE == 'postgis' or _DATABASE_URL.startswith('postgis://')

INSTALLED_APPS = [
    'daphne',                                                                               
    'julmin_taxis.apps.JulminTaxisConfig',                                                          
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
                 
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'channels',
    'django_filters',
                
    'accounts',
    'orders',
    'drivers',
    'chat',
    'notifications',
    'forum',
    'blog',
    'chatbot',
    'admin_panel',
    'firebase_db',
    'pricing',
    'enterprises',
    'geo',
    'lieux',
]

if USE_POSTGIS:
    INSTALLED_APPS.insert(
        INSTALLED_APPS.index('django.contrib.staticfiles') + 1,
        'django.contrib.gis',
    )

MIDDLEWARE = [
    'julmin_taxis.wellknown_views.WellKnownAssociationMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    
    'julmin_taxis.security_middleware.CapacitorCrossOriginCookieMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.gzip.GZipMiddleware',
    'julmin_taxis.native_shell.DaxiNativeShellMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'julmin_taxis.security_middleware.RateLimitMiddleware',
    'julmin_taxis.security_middleware.SecurityHeadersMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'julmin_taxis.security_middleware.StaffHtmxCsrfExemptMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'julmin_taxis.urls'
CSRF_FAILURE_VIEW = 'julmin_taxis.error_views.csrf_failure'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'julmin_taxis.wsgi.application'
ASGI_APPLICATION = 'julmin_taxis.asgi.application'

if _DATABASE_URL:
    DATABASES = {'default': _parse_database_url(_DATABASE_URL)}
elif USE_POSTGIS:
    DATABASES = {
        'default': {
            'ENGINE': 'django.contrib.gis.db.backends.postgis',
            'NAME': os.environ.get('POSTGRES_DB', 'daxi'),
            'USER': os.environ.get('POSTGRES_USER', 'daxi'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
            'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '60') or '60'),
        }
    }
elif _DATABASE_ENGINE in ('postgresql', 'postgres'):
    _pg = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'daxi'),
        'USER': os.environ.get('POSTGRES_USER', 'daxi'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '60') or '60'),
    }
    _ssl = os.environ.get('POSTGRES_SSLMODE', '').strip()
    if _ssl:
        _pg['OPTIONS'] = {'sslmode': _ssl}
    DATABASES = {'default': _pg}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
            'OPTIONS': {
                'timeout': 60,
            },
        }
    }

GEO_DATA_ROOT = BASE_DIR / 'geo_data'

BACKUP_ENABLED = os.environ.get('BACKUP_ENABLED', 'True') == 'True'
BACKUP_DIR = Path(os.environ.get('BACKUP_DIR', str(BASE_DIR / 'backups')))
BACKUP_INTERVAL_HOURS = int(os.environ.get('BACKUP_INTERVAL_HOURS', '24') or '24')
BACKUP_KEEP_DAYS = int(os.environ.get('BACKUP_KEEP_DAYS', '14') or '14')

                              
                                                                             
REDIS_URL = os.environ.get('REDIS_URL', '')
if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }

      
AUTH_USER_MODEL = 'accounts.CustomUser'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

                      
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'America/Port-au-Prince'
USE_I18N = True
USE_TZ = True

              
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'

             
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DATA_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 2000

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

                                                                    
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_AGE = 86400 * 7
SESSION_COOKIE_HTTPONLY = True


SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_USE_SESSIONS = False

                
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    
    
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('DRF_THROTTLE_ANON', '120/hour'),
        'user': os.environ.get('DRF_THROTTLE_USER', '600/hour'),
    },
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

     
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.environ.get('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', '60'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.environ.get('JWT_REFRESH_TOKEN_LIFETIME_DAYS', '7'))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

                                                        
_csrf_origins = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_origins.split(',') if o.strip()]
for _o in (
    'https://daxipro.com',
    'https://www.daxipro.com',
):
    if _o not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_o)
if _railway_domain:
    _rail_origin = f'https://{_railway_domain}'
    if _rail_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_rail_origin)
if DEBUG:
    CSRF_TRUSTED_ORIGINS += [
        'https://*.ngrok-free.dev',
        'http://*.ngrok-free.dev',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
    ]

_cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(',') if o.strip()]
if DEBUG and not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://localhost:3000',
    ]
_CAPACITOR_ORIGINS = (
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
)
for _o in _CAPACITOR_ORIGINS:
    if _o not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_o)
    if _o not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_o)
CORS_ALLOW_CREDENTIALS = True
CORS_EXPOSE_HEADERS = ['X-CSRFToken']
try:
    from corsheaders.defaults import default_headers as _cors_default_headers
    CORS_ALLOW_HEADERS = list(_cors_default_headers) + [
        'x-daxi-native',
        'x-daxi-hybrid',
        'ngrok-skip-browser-warning',
    ]
except Exception:
    pass

       
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.zoho.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', 'info@daxipro.com')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'DAXI <info@daxipro.com>')

             
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

        
MAPBOX_ACCESS_TOKEN = os.environ.get('MAPBOX_ACCESS_TOKEN', '')

         
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')

                                                                                            
                                                                                    
DRIVER_REGISTRATION_STRICT_DOCS = os.environ.get('DRIVER_REGISTRATION_STRICT_DOCS', '').lower() in ('1', 'true', 'yes')
DRIVER_DOC_ALLOW_MANUAL_REVIEW = os.environ.get(
    'DRIVER_DOC_ALLOW_MANUAL_REVIEW', 'true'
).lower() in ('1', 'true', 'yes')

              
OTP_EXPIRY_MINUTES = 10

           
SITE_NAME = 'DAXI'
SITE_URL = os.environ.get('SITE_URL', 'http://localhost:8000')
ANDROID_APP_PACKAGE = os.environ.get('ANDROID_APP_PACKAGE', 'com.daxipro.daxi')

ANDROID_APP_SHA256_DEBUG = os.environ.get(
    'ANDROID_APP_SHA256_DEBUG',
    '23:9A:2B:CA:63:B6:5F:AF:68:9E:92:88:47:22:A5:F0:64:E7:81:02:D6:64:FE:A0:2F:62:15:3D:8B:47:0F:A7',
)
ANDROID_APP_SHA256_RELEASE = os.environ.get('ANDROID_APP_SHA256_RELEASE', '')
ANDROID_APP_SHA256_PLAY = os.environ.get('ANDROID_APP_SHA256_PLAY', '')
ANDROID_APP_SHA256_FINGERPRINTS = os.environ.get('ANDROID_APP_SHA256_FINGERPRINTS', '')
IOS_APP_TEAM_ID = os.environ.get('IOS_APP_TEAM_ID', 'YOUR_APPLE_TEAM_ID')
IOS_APP_BUNDLE_ID = os.environ.get('IOS_APP_BUNDLE_ID', 'com.daxipro.daxi')

                                               
FCM_SERVER_KEY = os.environ.get('FCM_SERVER_KEY', '')
FCM_PROJECT_ID = os.environ.get('FCM_PROJECT_ID', '')
# Railway: coller le JSON du service account dans FCM_SERVICE_ACCOUNT_JSON (une ligne).
# Local: fichier secrets/firebase-service-account.json
FCM_SERVICE_ACCOUNT_JSON = (os.environ.get('FCM_SERVICE_ACCOUNT_JSON') or '').strip()
_fcm_raw = os.environ.get('FCM_SERVICE_ACCOUNT_PATH', 'secrets/firebase-service-account.json')
_fcm_path = Path(_fcm_raw)
FCM_SERVICE_ACCOUNT_PATH = str(_fcm_path if _fcm_path.is_absolute() else BASE_DIR / _fcm_raw)
# Env JSON prioritaire même si un ancien fichier corrompu existe encore sur disque.
if FCM_SERVICE_ACCOUNT_JSON:
    try:
        _sa_dir = BASE_DIR / 'secrets'
        _sa_dir.mkdir(parents=True, exist_ok=True)
        _sa_out = _sa_dir / 'firebase-service-account.from-env.json'
        _sa_out.write_text(FCM_SERVICE_ACCOUNT_JSON, encoding='utf-8')
        FCM_SERVICE_ACCOUNT_PATH = str(_sa_out)
    except Exception:
        pass

                                                                          
_FIREBASE_WEB_DEFAULTS = {
    'apiKey': 'AIzaSyCdGFcwfzj8b5eJXcmrS0LGRIxnTXZ6zac',
    'authDomain': 'julmin-taxis.firebaseapp.com',
    'projectId': 'julmin-taxis',
    'messagingSenderId': '392925120550',
    'appId': '1:392925120550:web:2935808aab4ead6d7d7ee7',
}
FIREBASE_WEB_CONFIG = {
    key: (os.environ.get(env_key, '') or _FIREBASE_WEB_DEFAULTS.get(key, ''))
    for key, env_key in (
        ('apiKey', 'FIREBASE_WEB_API_KEY'),
        ('authDomain', 'FIREBASE_WEB_AUTH_DOMAIN'),
        ('projectId', 'FIREBASE_WEB_PROJECT_ID'),
        ('messagingSenderId', 'FIREBASE_WEB_MESSAGING_SENDER_ID'),
        ('appId', 'FIREBASE_WEB_APP_ID'),
    )
}
FIREBASE_WEB_VAPID_KEY = (
    os.environ.get('FIREBASE_WEB_VAPID_KEY', '')
    or 'BPsvNMF0v2XilPFDCMub9-F0Vao4lNw7bDlTZ_RuIneOy37xNkiXHr2WCidf_HD5kxOI9uiZ_7momDE5apV8shg'
)

                                                                               
if not DEBUG:
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True') == 'True'
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
                                                          
    X_FRAME_OPTIONS = 'SAMEORIGIN'
    SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

                                                                           
_CSP_BASE = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' "
    "https://maps.googleapis.com https://unpkg.com https://cdn.jsdelivr.net "
    "https://cdnjs.cloudflare.com https://www.gstatic.com https://www.google.com "
    "https://carimagesapi.com; "
    "style-src 'self' 'unsafe-inline' "
    "https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:; "
    "img-src 'self' data: blob: https: http: http://localhost:* http://127.0.0.1:*; "
    "connect-src 'self' data: blob: https://maps.googleapis.com https://*.googleapis.com "
    "https://*.gstatic.com https://www.gstatic.com "
    "https://api.cloudinary.com https://fcmregistrations.googleapis.com "
    "https://firebaseinstallations.googleapis.com https://firebase.googleapis.com "
    "https://www.googleapis.com https://cdn.jsdelivr.net wss: ws:; "
    "worker-src 'self' blob:; "
    "frame-src 'self' https://maps.google.com; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'self';"
)
CONTENT_SECURITY_POLICY = _CSP_BASE if DEBUG else (
    _CSP_BASE.replace("'unsafe-eval'", '').replace("  ", " ")
)
