-- Remove legacy service-completion sync triggers that duplicate the newer
-- centralized workflow synchronization trigger.
-- This is safe to apply even when the legacy triggers are absent.

DROP TRIGGER IF EXISTS trg_sync_transport_request_after_service
  ON public.service;

DROP TRIGGER IF EXISTS trg_sync_transport_vehicle_km_after_service
  ON public.service;

-- Keep the centralized trigger as the single source of truth.
-- Its name is intentionally explicit so future migrations can target it safely.
