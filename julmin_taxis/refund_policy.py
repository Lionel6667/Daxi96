"""
Politique d'annulation, remboursement et contrat de service DAXI.
Utilisé pour le contrat client au moment du paiement et le calcul des frais dus.
"""
from decimal import Decimal, ROUND_HALF_UP

                                                      
FORFAIT_PLANS = frozenset({
    'demi-journee', 'journee-complete', 'elegance-night', 'business-vip',
    'accueil-aeroport', 'ville-a-ville', 'plan2', 'plan3', 'plan4', 'plan6',
})

                                                                                             
CANCELLATION_RETENTION = {
    'pending': Decimal('0'),
    'price_proposed': Decimal('0'),
    'price_confirmed': Decimal('0'),
    'driver_assigned': Decimal('15'),
    'on_way': Decimal('35'),
    'arrived': Decimal('55'),
    'in_progress': Decimal('75'),
    'completed': Decimal('100'),
}

CANCELLATION_STATUS_FR = {
    'price_confirmed': 'Prix confirmé',
    'driver_assigned': 'Chauffeur assigné',
    'on_way': 'En route',
    'arrived': 'Chauffeur arrivé',
    'in_progress': 'Course en cours',
}

                                                                                    
FORFAIT_LATE_CANCEL_EXTRA = Decimal('30')                                            


def _money(amount):
    return Decimal(amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def is_forfait_plan(service_plan: str) -> bool:
    if not service_plan:
        return False
    s = service_plan.strip().lower().replace('_', '-')
    if s in FORFAIT_PLANS or s.startswith('plan'):
        return True
    return s in ('2', '3', '4', '6')


def cancellation_retention_percent(order_status: str, service_plan: str = '', late_forfait: bool = False) -> Decimal:
    pct = CANCELLATION_RETENTION.get(order_status, Decimal('0'))
    if late_forfait and is_forfait_plan(service_plan):
        pct = min(Decimal('100'), pct + FORFAIT_LATE_CANCEL_EXTRA)
    return pct


def compute_cancellation_fee(order) -> Decimal:
    """Montant USD retenu / dû par le client en cas d'annulation."""
    price = order.price or Decimal('0')
    if price <= 0:
        return Decimal('0')
    status = order.status
    if status in ('cancelled', 'completed'):
        status = getattr(order, '_cancel_fee_status_snapshot', None) or 'price_confirmed'
    pct = cancellation_retention_percent(
        status,
        getattr(order, 'service_plan', '') or '',
        late_forfait=getattr(order, '_cancel_late_forfait', False),
    )
    return _money(price * pct / Decimal('100'))


def compute_online_refund_amount(order, fee: Decimal | None = None) -> Decimal:
    """Montant remboursé au client si paiement en ligne (MonCash / carte)."""
    price = order.price or Decimal('0')
    fee = fee if fee is not None else compute_cancellation_fee(order)
    return _money(max(Decimal('0'), price - fee))


def service_contract_html() -> str:
    """Contrat complet affiché au client avant validation du paiement."""
    from django.utils import timezone
    date_str = timezone.now().strftime('%d/%m/%Y')
    return f'''
<div class="daxi-contract-doc">
  <div class="daxi-contract-hero">
    <p class="daxi-contract-kicker">Politique de remboursement et d'annulation</p>
    <h2>Conditions de transport DAXI</h2>
    <p class="daxi-contract-lead">
      Dernière mise à jour : {date_str}<br><br>
      La présente Politique de remboursement fait partie des Conditions générales de transport de DAXI.
      En réservant une course, le client reconnaît avoir pris connaissance de cette politique et l'accepte.
    </p>
  </div>

  <p>Cette politique s'applique à l'ensemble des services proposés par DAXI, notamment :</p>
  <ul>
    <li>Courses immédiates</li>
    <li>Courses programmées</li>
    <li>Aller-retour</li>
    <li>Transferts aéroport</li>
    <li>Courses interurbaines</li>
    <li>Services VIP</li>
    <li>Demi-journées</li>
    <li>Journées complètes</li>
    <li>Tous autres forfaits proposés dans l'application</li>
  </ul>

  <h3>1. Principe général</h3>
  <p>Le client peut annuler une course à tout moment.</p>
  <p>Toutefois, lorsqu'un chauffeur a déjà consacré du temps, parcouru une distance ou commencé l'exécution du service,
  une partie du montant payé peut être conservée afin de rémunérer le chauffeur et de couvrir les coûts opérationnels de DAXI.</p>

  <h3>2. Barème des remboursements</h3>
  <table class="daxi-contract-table daxi-contract-table--refund">
    <thead>
      <tr>
        <th>Situation</th>
        <th>Montant remboursé</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>Avant qu'un chauffeur soit assigné</td><td><strong>100 %</strong></td></tr>
      <tr><td>Prix confirmé mais aucun chauffeur assigné</td><td><strong>100 %</strong></td></tr>
      <tr><td>Chauffeur assigné</td><td><strong>85 %</strong></td></tr>
      <tr><td>Chauffeur en route vers le point de prise en charge</td><td><strong>65 %</strong></td></tr>
      <tr><td>Chauffeur arrivé au point de rendez-vous</td><td><strong>45 %</strong></td></tr>
      <tr><td>Course commencée</td><td><strong>25 %</strong></td></tr>
      <tr><td>Course terminée</td><td><strong>0 %</strong></td></tr>
    </tbody>
  </table>
  <p class="daxi-contract-refund-note">Les pourcentages ci-dessus sont calculés sur le montant total confirmé avant la course.</p>

  <h3>3. Délais de remboursement</h3>
  <p>Les remboursements sont effectués sur le moyen de paiement utilisé lors de la réservation.</p>
  <p>Le délai de traitement est généralement compris entre 3 et 10 jours ouvrés, selon la banque, MonCash ou l'établissement de paiement.</p>

  <h3>4. Paiements en espèces</h3>
  <p>Si la course devait être payée en espèces et que des frais d'annulation s'appliquent, ces frais devront être payés à DAXI.</p>
  <p>Tant que ce montant n'est pas réglé, le client ne pourra pas effectuer de nouvelle réservation.</p>

  <h3>5. Annulation par DAXI</h3>
  <p>Si DAXI annule une course pour l'une des raisons suivantes :</p>
  <ul>
    <li>indisponibilité de chauffeur ;</li>
    <li>problème technique ;</li>
    <li>impossibilité d'assurer le service ;</li>
  </ul>
  <p>le client reçoit un remboursement intégral, lorsque le paiement a été effectué en ligne.</p>

  <h3>6. Réservations et forfaits</h3>
  <p>Les réservations programmées peuvent être annulées gratuitement jusqu'à 24 heures avant l'heure prévue,
  lorsqu'aucun chauffeur n'a encore été affecté.</p>
  <p>Passé ce délai, le barème de remboursement s'applique, avec une retenue supplémentaire de 30 % propre aux services réservés.</p>
  <p>En cas d'absence du client au point de rendez-vous (« No-Show »), le minimum facturé correspond au niveau Chauffeur arrivé.</p>

  <h3>7. Courses terminées</h3>
  <p>Aucun remboursement n'est accordé lorsque :</p>
  <ul>
    <li>la course est terminée ;</li>
    <li>le client quitte volontairement le véhicule après le trajet ;</li>
    <li>le service a été exécuté conformément à la réservation.</li>
  </ul>

  <h3>8. Litiges</h3>
  <p>Toute contestation doit être adressée au service client dans un délai maximum de 24 heures après la course.</p>
  <p>Pour l'analyse d'un dossier, DAXI peut utiliser :</p>
  <ul>
    <li>les données GPS ;</li>
    <li>les horodatages ;</li>
    <li>les communications effectuées via la plateforme ;</li>
    <li>les informations de paiement.</li>
  </ul>
  <p>Ces éléments font foi pour déterminer le déroulement de la course.</p>

  <h3>9. Suspension du compte</h3>
  <p>Tout montant dû à DAXI peut entraîner la suspension temporaire du compte client jusqu'au règlement intégral.</p>

  <h3>10. Droit applicable</h3>
  <p>Cette politique est régie par les lois de la République d'Haïti.</p>
  <p class="daxi-contract-footer">Pour toute question : Support WhatsApp <strong>+509 44 96 96 96</strong></p>
</div>
'''
