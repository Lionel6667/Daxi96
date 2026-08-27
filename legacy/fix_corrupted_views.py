import os

def fix_htmx_views():
    path = 'julmin_taxis_django/julmin_taxis/htmx_views.py'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    
    start_idx = -1
    for i, line in enumerate(lines):
        if 'def client_order_status(request, order_id):' in line:
            start_idx = i
            break
    
    if start_idx != -1:
        
        lines = lines[:start_idx]
    
    
    correct_code = """
def client_order_status(request, order_id):
    \"\"\"GET /htmx/client/orders/<order_id>/status/ — returns driver position and order status as JSON.\"\"\"
    try:
        order = Order.objects.select_related('driver').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        order = Order.objects.select_related('driver').filter(firebase_uid=str(order_id)).first()
        if not order:
            return JsonResponse({'error': 'Order not found'}, status=404)

    from django.http import JsonResponse
    data = {
        'order_id': order.pk,
        'status': order.status,
        'driver_lat': order.driver.latitude if order.driver else None,
        'driver_lng': order.driver.longitude if order.driver else None,
    }
    return JsonResponse(data)
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
        f.write(correct_code)
    print("Fixed htmx_views.py")

fix_htmx_views()
