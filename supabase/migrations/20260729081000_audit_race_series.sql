drop trigger if exists os_audit_changes on public.os_series;
create trigger os_audit_changes after insert or update or delete on public.os_series
for each row execute function public.os_capture_audit();

drop trigger if exists os_audit_changes on public.os_series_events;
create trigger os_audit_changes after insert or update or delete on public.os_series_events
for each row execute function public.os_capture_audit();
