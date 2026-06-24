-- Expand the profile time-zone choices to cover U.S. states, territories,
-- and DST/non-DST variants with canonical IANA zones.

alter table public.profiles
  drop constraint if exists profiles_default_timezone_us_valid,
  add constraint profiles_default_timezone_us_valid
    check (
      default_timezone is null or default_timezone in (
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Phoenix',
        'America/Los_Angeles',
        'America/Anchorage',
        'America/Adak',
        'Pacific/Honolulu',
        'America/Puerto_Rico',
        'Pacific/Pago_Pago',
        'Pacific/Guam'
      )
    );
