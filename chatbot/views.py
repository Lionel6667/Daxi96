from django.contrib.auth.models import AnonymousUser
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from chat.models import ChatSession, ChatMessage
from .models import SiteTranslation
from .ai_service import get_ai_response


class ChatbotMessageView(APIView):
    """
    Handle chatbot messages.
    Replaces phpscript/api.php completely.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        message = request.data.get('message', '').strip()
        session_id = request.data.get('session_id')
        language = request.data.get('language', 'fr')
        guest_id = request.data.get('guest_id', '')
        audience = (request.data.get('audience') or 'client').strip().lower()
        if audience in ('chauffeur', 'driver'):
            audience = 'driver'
        else:
            audience = 'client'

        if not message:
            return Response({'error': 'Message requis.'}, status=status.HTTP_400_BAD_REQUEST)

                               
        session = None
        if session_id:
            try:
                session = ChatSession.objects.get(pk=session_id)
            except ChatSession.DoesNotExist:
                pass

        if not session:
            if request.user.is_authenticated:
                session = ChatSession.objects.create(user=request.user)
            else:
                session = ChatSession.objects.create(guest_id=guest_id)

                           
        ChatMessage.objects.create(
            session=session,
            role='user',
            content=message
        )

                                              
        history = list(
            session.messages.values('role', 'content').order_by('timestamp')
        )

                         
        ai_result = get_ai_response(message, history, language, audience=audience)

                           
        if ai_result.get('escalated'):
            session.is_escalated = True
            session.save(update_fields=['is_escalated'])
            try:
                from julmin_taxis.notify import notify_admin_chat_escalated_event
                notify_admin_chat_escalated_event(session.pk, message)
            except Exception:
                pass

                                 
        ChatMessage.objects.create(
            session=session,
            role='assistant',
            content=ai_result['response']
        )

        return Response({
            'response': ai_result['response'],
            'session_id': session.pk,
            'escalated': ai_result.get('escalated', False),
        })


class ChatHistoryView(APIView):
    """Get chat session history."""
    permission_classes = [AllowAny]

    def get(self, request, session_id):
        try:
            session = ChatSession.objects.get(pk=session_id)
        except ChatSession.DoesNotExist:
            return Response({'error': 'Session introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        messages = session.messages.values('role', 'content', 'timestamp').order_by('timestamp')
        return Response({
            'session_id': session_id,
            'is_escalated': session.is_escalated,
            'messages': list(messages)
        })


class AdminChatSessionsView(APIView):
    """Admin: list escalated chat sessions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        sessions = ChatSession.objects.filter(
            is_escalated=True, is_resolved=False
        ).select_related('user').order_by('-updated_at')[:50]

        data = []
        for s in sessions:
            last_msg = s.messages.order_by('-timestamp').first()
            data.append({
                'id': s.pk,
                'user': s.user.get_full_name() if s.user else s.guest_id or 'Anonyme',
                'user_email': s.user.email if s.user else '',
                'last_message': last_msg.content if last_msg else '',
                'message_count': s.messages.count(),
                'created_at': s.created_at,
                'updated_at': s.updated_at,
                'is_resolved': s.is_resolved,
            })

        return Response(data)


class AdminResolveChatView(APIView):
    """Admin resolves an escalated chat session."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, session_id):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            session = ChatSession.objects.get(pk=session_id)
        except ChatSession.DoesNotExist:
            return Response({'error': 'Session introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        session.is_resolved = True
        session.save(update_fields=['is_resolved'])
        return Response({'message': 'Session résolue.'})


class AdminReplyChatView(APIView):
    """Admin replies to a chat session."""
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            session = ChatSession.objects.get(pk=session_id)
        except ChatSession.DoesNotExist:
            return Response({'error': 'Session introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message requis.'}, status=status.HTTP_400_BAD_REQUEST)

        ChatMessage.objects.create(session=session, role='admin', content=content)
        return Response({'message': 'Réponse envoyée.'})


class EscalationsView(APIView):
    """
    List escalated chat sessions. Replaces api_queue.php?action=escalations.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from julmin_taxis.staff_auth import user_is_staff
        if not user_is_staff(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        sessions = ChatSession.objects.filter(
            is_escalated=True, is_resolved=False
        ).select_related('user').order_by('-updated_at')[:100]

        escalations = []
        for s in sessions:
            last_msg = s.messages.order_by('-timestamp').first()
            escalations.append({
                'escalationId': s.pk,
                'userId': s.user.pk if s.user else s.guest_id or str(s.pk),
                'userEmail': s.user.email if s.user else '',
                'userName': s.user.get_full_name() if s.user else s.guest_id or 'Anonyme',
                'lastMessage': last_msg.content if last_msg else '',
                'messageCount': s.messages.count(),
                'createdAt': s.created_at,
                'notificationSent': False,
            })

        return Response({
            'success': True,
            'escalations': escalations,
            'count': len(escalations),
        })


class ResolveEscalationView(APIView):
    """Resolve escalation. Replaces api_queue.php?action=resolve_escalation"""
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        from julmin_taxis.staff_auth import user_is_staff
        if not user_is_staff(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            session = ChatSession.objects.get(pk=session_id)
        except ChatSession.DoesNotExist:
            return Response({'error': 'Session introuvable.'}, status=404)
        session.is_resolved = True
        session.save(update_fields=['is_resolved'])
        return Response({'success': True, 'message': 'Escalation résolue.'})


                                                                               
                   
                                                                               

                                                       
FR_BASE = {
    "processing": "Traitement...",
    "order_taxi": "Commander votre taxi",
    "different_address": "Indiquer une adresse de départ différente",
    "share_location_btn": "Activer la localisation",
    "manual_address_btn": "Entrer l'adresse manuellement",
    "one_way": "Allez simple",
    "round_trip": "Allez retour",
    "now": "Maintenant",
    "later": "Plus tard",
    "order_taxi_btn": "Commander un Taxi",
    "top_drivers": "Meilleurs Chauffeurs de la Semaine",
    "pending_orders": "Commandes en attente",
    "discover_haiti": "Découvrez Haïti",
    "citadelle_name": "Citadelle La Ferrière",
    "citadelle_desc": "Forteresse historique perchée sur une montagne",
    "labadee_name": "Labadee",
    "labadee_desc": "Plages paradisiaques et eaux cristallines",
    "verrieres_name": "Monuments de Vertière",
    "verrieres_desc": "Mémorial historique de la bataille de Vertière",
    "cathedrale_name": "Cathédrale de Cap-Haïtien",
    "cathedrale_desc": "Joyau architectural du nord d'Haïti",
    "palais_name": "Palais Sans Souci",
    "palais_desc": "Ancien palais royal d'Henri Christophe",
    "learn_more": "En savoir plus",
    "services": "Services à bord",
    "trip_history": "Historique des parcours",
    "download_app": "Téléchargez notre application mobile",
    "download_apk": "Télécharger l'APK",
    "login": "Connexion",
    "id_tab": "ID",
    "password_tab": "Mot de passe",
    "signup_tab": "Inscription",
    "your_id": "Votre ID",
    "login_with_id": "Se connecter avec mon ID",
    "email": "Email",
    "password": "Mot de passe",
    "create_account": "Créer un compte",
    "last_name": "Nom",
    "first_name": "Prénom",
    "confirm_password": "Confirmer le mot de passe",
    "age": "Âge",
    "unique_id": "Votre ID unique",
    "save_id": "Conservez cet ID pour accéder à votre compte depuis n'importe quel appareil",
    "save": "Enregistrer",
    "password_error": "Les mots de passe ne correspondent pas",
    "close": "Fermer",
    "accept": "Accepter",
    "back": "Retour",
    "cancel": "Annuler",
    "logout": "Déconnexion",
    "language": "Langue",
    "service_plans": "Nos Plans de Services",
    "plan1_title": "Course Ville à Ville",
    "plan1_sub": "Prix à déterminer",
    "plan2_title": "Demi-Journée",
    "plan2_sub": "4 heures - 70$",
    "plan3_title": "Journée Complète",
    "plan3_sub": "8 heures - 140$",
    "plan4_title": "Élégance Night",
    "plan4_sub": "Jusqu'à 3h - 150$",
    "plan5_title": "Business / VIP",
    "plan5_sub": "Abonnement - Prix à déterminer",
    "frequent_routes": "Itinéraires fréquents",
    "departure_placeholder": "Adresse de départ",
    "destination_placeholder": "Adresse de destination",
    "description_placeholder": "Description pour aider le chauffeur à vous repérer",
    "passenger_count_label": "Nombre de passagers",
    "no_pending": "Aucune commande en attente",
    "no_history": "Vous n'avez encore terminé aucun trajet",
    "phone": "Téléphone",
    "notify_title": "Autoriser les notifications",
    "notify_desc": "Recevez des alertes lorsque votre course est acceptée.",
    "notify_allow": "Autoriser",
}


class SiteTranslationsView(APIView):
    """GET /api/translations/?lang=en — traductions par clé (cache DB + FR_BASE)."""
    permission_classes = [AllowAny]

    def get(self, request):
        lang = request.query_params.get('lang', 'fr')
        if lang == 'fr':
            return Response({'language': 'fr', 'translations': FR_BASE})

        qs = SiteTranslation.objects.filter(language=lang)
        if not qs.exists():
            return Response({'language': lang, 'translations': {}})

        translations = {obj.key: obj.value for obj in qs}
        return Response({'language': lang, 'translations': translations})


class SiteTranslationBundleView(APIView):
    """
    GET /api/translations/bundle/?lang=en
    Paquet complet pour traduction instantanée côté client (clés + texte FR→langue).
    """
    permission_classes = [AllowAny]

    def get(self, request):
        lang = (request.GET.get('lang') or '').strip()
        if not lang or lang == 'fr':
            return Response({'language': 'fr', 'keys': {}, 'phrases': {}})

        qs = SiteTranslation.objects.filter(language=lang)
        keys = {}
        phrases = {}
        for obj in qs:
            if obj.key.startswith('auto:'):
                continue
            keys[obj.key] = obj.value
        for obj in qs.filter(key__startswith='auto:'):
                                                                                           
            pass
                                                                                                                    
        auto_rows = SiteTranslation.objects.filter(language=lang, key__startswith='auto:')
        for obj in auto_rows:
            phrases[obj.key] = obj.value

        return Response({
            'language': lang,
            'keys': keys,
            'phrases': phrases,
        })


class AutoTranslateView(APIView):
    """
    POST /api/translations/auto/  body: {lang: 'en', texts: ['Bonjour', ...]}
    Traduit automatiquement du texte libre FR → langue cible (cache DB par hash).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import hashlib
        import json as json_module

        lang = (request.data.get('lang') or '').strip()
        texts = request.data.get('texts') or []
        if not lang or lang == 'fr':
            return Response({'error': 'Langue cible requise.'}, status=400)
        if not isinstance(texts, list) or not texts:
            return Response({'translations': {}})

        lang_names = {'en': 'English', 'ht': 'Haitian Creole (Kreyòl)', 'es': 'Spanish (Español)'}
        lang_name = lang_names.get(lang, lang)

        unique = []
        seen = set()
        for t in texts:
            s = str(t).strip()
            if len(s) < 2 or s in seen:
                continue
            seen.add(s)
            unique.append(s)
        unique = unique[:120]

        def text_key(text):
            return 'auto:' + hashlib.sha256(text.encode('utf-8')).hexdigest()[:48]

        result = {}
        to_ai = {}
        for text in unique:
            key = text_key(text)
            cached = SiteTranslation.objects.filter(language=lang, key=key).first()
            if cached:
                result[text] = cached.value
            else:
                to_ai[text] = key

        if to_ai:
            prompt = (
                f"Translate each French string to {lang_name}. "
                f"Return ONLY valid JSON object mapping original French strings to translations. "
                f"Keep proper nouns (Daxi, Cap-Haïtien, MonCash, etc.) unchanged.\n\n"
                f"{json_module.dumps(list(to_ai.keys()), ensure_ascii=False)}"
            )
            try:
                ai = get_ai_response(prompt, [], lang)
                raw = ai.get('response', '')
                start, end = raw.find('{'), raw.rfind('}') + 1
                if start >= 0 and end > start:
                    translated = json_module.loads(raw[start:end])
                    for fr_text, tr_val in translated.items():
                        if fr_text not in to_ai:
                            continue
                        val = str(tr_val).strip()
                        if not val:
                            continue
                        SiteTranslation.objects.update_or_create(
                            language=lang, key=to_ai[fr_text],
                            defaults={'value': val},
                        )
                        result[fr_text] = val
            except Exception:
                pass

        return Response({'language': lang, 'translations': result})


class GenerateTranslationsView(APIView):
    """
    POST /api/translations/generate/  body: {lang: 'en'}
    Uses AI to translate all FR_BASE keys to the target language and stores in DB.
    Idempotent: skips keys that already exist.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        lang = request.data.get('lang', '').strip()
        if not lang or lang == 'fr':
            return Response({'error': 'Langue cible requise (pas fr).'}, status=400)

        lang_names = {'en': 'English', 'ht': 'Haitian Creole (Kreyòl)', 'es': 'Spanish (Español)'}
        lang_name = lang_names.get(lang, lang)

                                      
        existing_keys = set(
            SiteTranslation.objects.filter(language=lang).values_list('key', flat=True)
        )
        to_translate = {k: v for k, v in FR_BASE.items() if k not in existing_keys}

        if not to_translate:
            all_trans = {obj.key: obj.value for obj in SiteTranslation.objects.filter(language=lang)}
            return Response({'language': lang, 'translations': all_trans, 'generated': 0})

                                  
        import json as json_module
        prompt = (
            f"Translate the following JSON object from French to {lang_name}. "
            f"Return ONLY valid JSON with the same keys but translated values. "
            f"Keep proper nouns (Daxi, Cap-Haïtien, Citadelle, etc.) unchanged.\n\n"
            f"{json_module.dumps(to_translate, ensure_ascii=False, indent=2)}"
        )

        try:
            result = get_ai_response(prompt, [], lang)
            text = result.get('response', '')
                                        
            start = text.find('{')
            end = text.rfind('}') + 1
            if start == -1 or end == 0:
                return Response({'error': 'AI did not return valid JSON.'}, status=500)
            translated = json_module.loads(text[start:end])
        except Exception as e:
            return Response({'error': str(e)}, status=500)

                    
        saved = 0
        for key, value in translated.items():
            if key in FR_BASE:
                SiteTranslation.objects.update_or_create(
                    language=lang, key=key,
                    defaults={'value': str(value)}
                )
                saved += 1

        all_trans = {obj.key: obj.value for obj in SiteTranslation.objects.filter(language=lang)}
        return Response({'language': lang, 'translations': all_trans, 'generated': saved})
