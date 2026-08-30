"""
HTMX URL patterns — all server-side endpoints that replace JavaScript in the 3 HTML pages.
Mounted at /htmx/ in the main urls.py.
"""
from django.urls import path
from . import htmx_views as v
from . import htmx_views_tracking as vt

urlpatterns = [
                                                                                 
    path('analyze-document/', v.analyze_document, name='htmx-analyze-document'),
    path('analyze-document', v.analyze_document),
    path('search-car-images/', v.search_car_images, name='htmx-search-car-images'),

                                                                                 
    path('admin/login/',          v.admin_login,           name='htmx-admin-login'),
    path('admin/logout/',         v.admin_logout,          name='htmx-admin-logout'),
    path('admin/change-password/', v.admin_change_password, name='htmx-admin-change-pw'),

                                                                                 
    path('admin/orders/',                          v.admin_orders,              name='htmx-admin-orders'),
    path('admin/orders/<order_id>/propose-price/', v.admin_propose_price,       name='htmx-admin-propose-price'),
    path('admin/orders/<order_id>/set-coords/',  v.admin_set_coords,          name='htmx-admin-set-coords'),
    path('admin/orders/<order_id>/assign-driver/', v.admin_assign_driver,       name='htmx-admin-assign-driver'),
    path('admin/orders/<order_id>/refuse/',        v.admin_refuse_order,        name='htmx-admin-refuse'),
    path('admin/orders/<order_id>/status/',        v.admin_update_order_status, name='htmx-admin-order-status'),
    path('admin/orders/<int:order_id>/delete/',    v.admin_delete_order,        name='htmx-admin-delete-order'),
    path('admin/drivers/available/',               v.admin_available_drivers,   name='htmx-admin-avail-drivers'),

                                                                                 
    path('admin/users/',                            v.admin_users_list,                name='htmx-admin-users'),
    path('admin/users/<user_id>/block/',            v.admin_block_user,                name='htmx-admin-block-user'),
    path('admin/users/block-by-firebase/',          v.admin_block_user_by_firebase_id, name='htmx-admin-block-firebase'),
    path('admin/check-blocked/',                    v.admin_check_user_blocked,        name='htmx-check-blocked'),

                                                                                 
    path('admin/drivers/',                     v.admin_drivers_list,   name='htmx-admin-drivers'),
    path('admin/drivers/<int:driver_id>/block/',      v.admin_block_driver,          name='htmx-admin-block-driver'),
    path('admin/drivers/<int:driver_id>/verify/',     v.admin_verify_driver,         name='htmx-admin-verify-driver'),
    path('admin/drivers/<int:driver_id>/reject/',     v.admin_reject_driver,         name='htmx-admin-reject-driver'),
    path('admin/drivers/<int:driver_id>/delete/',     v.admin_delete_driver,         name='htmx-admin-delete-driver'),
    path('admin/drivers/<int:driver_id>/car-image/',  v.admin_set_driver_car_image,  name='htmx-admin-driver-car-image'),
    path('admin/drivers/<int:driver_id>/vehicle-reference-download/', v.admin_download_vehicle_reference, name='htmx-admin-driver-vehicle-ref-download'),
    path('admin/drivers/<int:driver_id>/photo/',       v.admin_set_driver_photo,      name='htmx-admin-driver-photo'),
    path('admin/drivers/<int:driver_id>/commission/', v.admin_set_driver_commission, name='htmx-admin-driver-commission'),

                                                                                 
    path('admin/pricing/', v.admin_pricing, name='htmx-admin-pricing'),
    path('admin/system-config/', v.admin_system_config, name='htmx-admin-system-config'),

                                                                                 
    path('admin/calendar/',     v.admin_calendar,     name='htmx-admin-calendar'),
    path('admin/calendar/day/', v.admin_calendar_day, name='htmx-admin-calendar-day'),

                                                                                 
    path('admin/stats/', v.admin_stats, name='htmx-admin-stats'),

                                                                                 
    path('admin/withdrawals/', v.admin_withdrawals, name='htmx-admin-withdrawals'),
    path('admin/withdrawals/driver/<int:tx_id>/', v.admin_driver_withdrawal_action, name='htmx-admin-driver-withdrawal'),
    path('admin/withdrawals/enterprise/<int:withdrawal_id>/', v.admin_enterprise_withdrawal_action, name='htmx-admin-enterprise-withdrawal'),

                                                                                 
    path('admin/chat/<order_id>/',       v.admin_chat_messages, name='htmx-admin-chat'),
    path('admin/chat/<order_id>/send/',  v.admin_chat_send,     name='htmx-admin-chat-send'),

                                                                                 
    path('driver/login/',    v.driver_login,    name='htmx-driver-login'),
    path('driver/register/', v.driver_register, name='htmx-driver-register'),
    path('driver/register/send-otp/', v.driver_send_reg_otp, name='htmx-driver-register-send-otp'),
    path('driver/register/verify-otp/', v.driver_verify_reg_otp, name='htmx-driver-register-verify-otp'),
    path('driver/logout/',   v.driver_logout,   name='htmx-driver-logout'),

                                                                                 
    path('driver/orders/',                            v.driver_orders,         name='htmx-driver-orders'),
    path('driver/orders/<order_id>/accept/',          v.driver_accept_order,   name='htmx-driver-accept'),
    path('driver/orders/<order_id>/status/',          v.driver_update_status,  name='htmx-driver-order-status'),
    path('driver/orders/<order_id>/dismiss-return-request/', v.driver_dismiss_return_request, name='htmx-driver-dismiss-return'),
    path('driver/orders/<order_id>/cancel/',          v.driver_cancel_order,   name='htmx-driver-cancel'),
    path('driver/orders/<order_id>/share/',           v.driver_share_trip,     name='htmx-driver-share-trip'),
    path('driver/orders/<order_id>/set-coords/',     v.driver_set_coords,     name='htmx-driver-set-coords'),

                                                                                 
    path('driver/status/',   v.driver_update_online_status, name='htmx-driver-status'),
    path('driver/location/', v.driver_update_location,      name='htmx-driver-location'),

                                                                                 
    path('driver/calendar/',     v.driver_calendar,     name='htmx-driver-calendar'),
    path('driver/calendar/day/', v.driver_calendar_day, name='htmx-driver-calendar-day'),
    path('driver/calendar/order/<int:order_id>/', v.driver_calendar_order_detail, name='htmx-driver-calendar-order'),

                                                                                 
    path('driver/profile/',        v.driver_profile,        name='htmx-driver-profile'),
    path('driver/profile/update/', v.driver_profile_update, name='htmx-driver-profile-update'),
    path('driver/stats/',          v.driver_stats,          name='htmx-driver-stats'),
    path('driver/active-order/',   v.driver_active_order,   name='htmx-driver-active-order'),

                                                                                 
    path('driver/chat/<int:order_id>/',        v.driver_chat_messages, name='htmx-driver-chat'),
    path('driver/chat/<int:order_id>/send/',   v.driver_chat_send,     name='htmx-driver-chat-send'),
    path('driver/chat/<int:order_id>/unread/', v.driver_unread_count,  name='htmx-driver-chat-unread'),
    path('chat/<scope>/<int:order_id>/<int:msg_id>/delete/', v.chat_message_delete, name='htmx-chat-delete'),
    path('chat/<scope>/<int:order_id>/<int:msg_id>/edit/',   v.chat_message_edit,   name='htmx-chat-edit'),
    path('driver/danger-check/',               v.driver_danger_zone_check, name='htmx-driver-danger-check'),

                                                                                 
    path('client/login/',         v.client_login,         name='htmx-client-login'),
    path('client/login-by-id/',   v.client_login_by_id,   name='htmx-client-login-by-id'),
    path('client/register/',      v.client_register,      name='htmx-client-register'),
    path('client/logout/',        v.client_logout,        name='htmx-client-logout'),
    path('client/account/',       v.client_account,       name='htmx-client-account'),
    path('client/account/settings/', v.client_account_settings, name='htmx-client-account-settings'),
    path('client/profile/update/', v.client_profile_update, name='htmx-client-profile-update'),
    path('client/profile/photo/',  v.client_profile_photo,  name='htmx-client-profile-photo'),
    path('client/account/delete/', v.client_account_delete, name='htmx-client-account-delete'),

                                                                                 
    path('client/orders/stats/',                     v.client_order_stats,    name='htmx-client-order-stats'),
    path('client/orders/',                           v.client_orders,         name='htmx-client-orders'),
    path('client/orders/sheet/',                     v.client_sheet_orders,   name='htmx-client-sheet-orders'),
    path('client/orders/<order_id>/sheet/',          v.client_order_sheet,    name='htmx-client-order-sheet'),
    path('client/orders/<order_id>/arrived/',        v.client_confirm_arrival, name='htmx-client-arrival'),
    path('client/orders/<order_id>/rating/',         v.client_submit_rating, name='htmx-client-rating'),
    path('client/orders/<order_id>/request-return/', v.client_request_return_pickup, name='htmx-client-request-return'),
    path('client/order/create/',                     v.client_create_order,   name='htmx-client-create-order'),
    path('client/orders/<order_id>/confirm-price/',  v.client_confirm_price,  name='htmx-client-confirm-price'),
    path('client/orders/<order_id>/phone/',          v.client_save_phone,     name='htmx-client-save-phone'),
    path('client/orders/<order_id>/coords/',         v.client_submit_coords,  name='htmx-client-submit-coords'),
    path('client/orders/<order_id>/refuse-price/',   v.client_refuse_price,   name='htmx-client-refuse-price'),
    path('client/orders/<order_id>/cancel/',         v.client_cancel_order,   name='htmx-client-cancel-order'),
    path('client/orders/<order_id>/receipt.pdf',          v.client_order_receipt_pdf, name='htmx-client-order-receipt'),
    path('client/orders/<order_id>/status/',         v.client_order_status,   name='htmx-client-order-status'),
    path('client/orders/<order_id>/payment/init/',   v.client_payment_init,   name='htmx-client-payment-init'),
    path('client/orders/<order_id>/payment/contract-ack/', v.client_payment_contract_ack, name='htmx-client-payment-contract-ack'),
    path('client/orders/<order_id>/payment/status/', v.client_payment_status, name='htmx-client-payment-status'),
    path('client/debt/pay/',                         v.client_debt_pay,       name='htmx-client-debt-pay'),
    path('client/orders/<order_id>/share/',          v.client_share_trip,     name='htmx-client-share-trip'),
                                                                                
    path('payment/transak/webhook/',                 v.transak_webhook,       name='htmx-transak-webhook'),
                   
    path('driver/wallet/',                           v.driver_wallet,                name='htmx-driver-wallet'),
    path('driver/wallet/pay-commission/',            v.driver_commission_pay_moncash, name='htmx-driver-pay-commission'),
    path('driver/wallet/cash-sent/',                 v.driver_cash_sent_moncash,     name='htmx-driver-cash-sent'),
    path('driver/wallet/withdraw/',                  v.driver_withdrawal_request,    name='htmx-driver-withdrawal'),
                            
    path('driver/orders/<order_id>/extend/',         v.driver_extend_trip,           name='htmx-driver-extend'),
    path('driver/orders/<order_id>/pause/',          v.driver_pause_trip,            name='htmx-driver-pause'),
    path('driver/orders/<order_id>/resume/',         v.driver_resume_trip,           name='htmx-driver-resume'),
    path('client/orders/<order_id>/client-with-driver/', v.client_with_driver, name='htmx-client-with-driver'),

                                                                                 
    path('client/chat/<order_id>/',        v.client_chat_messages, name='htmx-client-chat'),
    path('client/chat/<order_id>/send/',   v.client_chat_send,     name='htmx-client-chat-send'),
    path('client/chat/<order_id>/unread/', v.client_unread_count,  name='htmx-client-chat-unread'),

                                                                                 
    path('forum/',                v.forum_list,   name='htmx-forum-list'),
    path('forum/<int:post_id>/',  v.forum_detail, name='htmx-forum-detail'),
    path('forum/create/',         v.forum_create, name='htmx-forum-create'),
    path('forum/<int:post_id>/delete/', v.forum_delete, name='htmx-forum-delete'),

                                                                                 
    path('blog/',                v.blog_list,   name='htmx-blog-list'),
    path('blog/<slug:slug>/',    v.blog_detail, name='htmx-blog-detail'),

                                                                                 
    path('order/<order_id>/unlock-check/', v.check_card_unlock, name='htmx-card-unlock'),

    path('orders/feed/', v.orders_feed, name='htmx-orders-feed'),

                                                                               
    path('order/<order_id>/track/',       vt.order_track,            name='htmx-order-track'),
    path('client/orders/<order_id>/update-gps/', vt.client_update_gps,     name='htmx-client-update-gps'),
    path('gps-diagnostic/', vt.gps_diagnostic_report, name='htmx-gps-diagnostic'),
    path('client/orders/<order_id>/update-pickup/', vt.client_update_pickup, name='htmx-client-update-pickup'),
    path('client/orders/<order_id>/confirm-pickup/', vt.client_confirm_pickup, name='htmx-client-confirm-pickup'),

                                                                                 
    path('client/lost-objects/', v.client_lost_objects_page, name='htmx-client-lost-objects'),
    path('client/orders/<order_id>/lost-object/', v.client_report_lost_object, name='htmx-client-lost-object'),
    path('client/orders/<order_id>/sos/', v.client_order_sos, name='htmx-client-order-sos'),
    path('driver/lost-objects/', v.driver_lost_objects, name='htmx-driver-lost-objects'),
    path('driver/lost-objects/<int:item_id>/handled/', v.driver_lost_object_handled, name='htmx-driver-lost-handled'),
    path('driver/orders/<order_id>/sos/', v.driver_order_sos, name='htmx-driver-order-sos'),
    path('admin/lost-objects/', v.admin_lost_objects, name='htmx-admin-lost-objects'),
    path('admin/lost-objects/<int:item_id>/status/', v.admin_lost_object_status, name='htmx-admin-lost-object-status'),
    path('admin/sos-alerts/', v.admin_sos_alerts, name='htmx-admin-sos-alerts'),

                                                                                 
    path('admin/assistance/', v.admin_assistance_escalations, name='htmx-admin-assistance'),
    path('admin/assistance/<int:session_id>/reply/', v.admin_assistance_reply, name='htmx-admin-assistance-reply'),
    path('admin/assistance/<int:session_id>/resolve/', v.admin_assistance_resolve, name='htmx-admin-assistance-resolve'),

                                                                                 
    path('enterprise/register/', v.enterprise_register, name='htmx-enterprise-register'),
    path('enterprise/login/',    v.enterprise_login,    name='htmx-enterprise-login'),
    path('enterprise/logout/',   v.enterprise_logout,   name='htmx-enterprise-logout'),
    path('enterprise/switch/',   v.enterprise_switch,   name='htmx-enterprise-switch'),

                                                                                 
    path('enterprise/dashboard/',      v.enterprise_dashboard,    name='htmx-enterprise-dashboard'),
    path('enterprise/chat/',           v.enterprise_chat,         name='htmx-enterprise-chat'),
    path('enterprise/chat/send/',      v.enterprise_chat_send,    name='htmx-enterprise-chat-send'),
    path('enterprise/orders/',         v.enterprise_orders,       name='htmx-enterprise-orders'),
    path('enterprise/plans/',          v.enterprise_plans,        name='htmx-enterprise-plans'),
    path('enterprise/location/set/',   v.enterprise_set_location, name='htmx-enterprise-location-set'),
    path('enterprise/location/help/',  v.enterprise_location_help, name='htmx-enterprise-location-help'),
    path('enterprise/order/create/',   v.enterprise_create_order, name='htmx-enterprise-create-order'),
    path('enterprise/orders/<int:order_id>/checkout/', v.enterprise_order_checkout, name='htmx-enterprise-order-checkout'),
    path('enterprise/orders/<int:order_id>/confirm-price/', v.enterprise_confirm_price, name='htmx-enterprise-confirm-price'),
    path('enterprise/orders/<int:order_id>/payment/', v.enterprise_payment_submit, name='htmx-enterprise-payment-submit'),
    path('enterprise/orders/<int:order_id>/checkout/back/', v.enterprise_checkout_back, name='htmx-enterprise-checkout-back'),
    path('enterprise/orders/<int:order_id>/cancel/', v.enterprise_cancel_order, name='htmx-enterprise-cancel-order'),
    path('enterprise/orders/<int:order_id>/chat/', v.enterprise_order_chat, name='htmx-enterprise-order-chat'),
    path('enterprise/orders/<int:order_id>/chat/send/', v.enterprise_order_chat_send, name='htmx-enterprise-order-chat-send'),
    path('enterprise/contract/', v.enterprise_contract_fragment, name='htmx-enterprise-contract'),
    path('enterprise/wallet/withdraw/', v.enterprise_withdrawal_request, name='htmx-enterprise-withdraw'),

                                                                                 
    path('admin/enterprises/',                                   v.admin_enterprises,           name='htmx-admin-enterprises'),
    path('admin/enterprises/<int:enterprise_id>/approve/',       v.admin_enterprise_approve,    name='htmx-admin-enterprise-approve'),
    path('admin/enterprises/<int:enterprise_id>/reject/',        v.admin_enterprise_reject,     name='htmx-admin-enterprise-reject'),
    path('admin/enterprises/<int:enterprise_id>/location/',    v.admin_enterprise_set_location, name='htmx-admin-enterprise-set-location'),
    path('admin/enterprises/<int:enterprise_id>/chat/',          v.admin_enterprise_chat,       name='htmx-admin-enterprise-chat'),
    path('admin/enterprises/<int:enterprise_id>/chat/send/',     v.admin_enterprise_chat_send,  name='htmx-admin-enterprise-chat-send'),

    path('admin/geo/zones/', __import__('geo.htmx_views', fromlist=['admin_geo_zones']).admin_geo_zones, name='htmx-admin-geo-zones'),
    path('admin/geo/download-department/', __import__('geo.htmx_views', fromlist=['admin_geo_download_department']).admin_geo_download_department, name='htmx-admin-geo-download'),
    path('admin/geo/activate-department/', __import__('geo.htmx_views', fromlist=['admin_geo_activate_department']).admin_geo_activate_department, name='htmx-admin-geo-activate'),
    path('admin/geo/deactivate-department/', __import__('geo.htmx_views', fromlist=['admin_geo_deactivate_department']).admin_geo_deactivate_department, name='htmx-admin-geo-deactivate'),
    path('admin/geo/sync-zones/', __import__('geo.htmx_views', fromlist=['admin_geo_sync_zones']).admin_geo_sync_zones, name='htmx-admin-geo-sync'),
    path('admin/geo/zones/<int:zone_id>/import/', __import__('geo.htmx_views', fromlist=['admin_geo_start_import']).admin_geo_start_import, name='htmx-admin-geo-import'),
    path('admin/geo/department-cities/<slug:dept_slug>/', __import__('geo.htmx_views', fromlist=['admin_geo_department_cities']).admin_geo_department_cities, name='htmx-admin-geo-cities'),
    path('admin/geo/jobs/<int:job_id>/cancel/', __import__('geo.htmx_views', fromlist=['admin_geo_cancel_job']).admin_geo_cancel_job, name='htmx-admin-geo-cancel-job'),
    path('admin/geo/jobs/<int:job_id>/', __import__('geo.htmx_views', fromlist=['admin_geo_job_status']).admin_geo_job_status, name='htmx-admin-geo-job'),
    path('admin/geo/zones/<int:zone_id>/map/', __import__('geo.htmx_views', fromlist=['admin_geo_zone_preview_map']).admin_geo_zone_preview_map, name='htmx-admin-geo-zone-map'),
]
