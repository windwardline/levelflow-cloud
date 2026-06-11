update public.profiles
set default_timezone = case
  when default_timezone in (
    'America/New_York',
    'America/Detroit',
    'America/Kentucky/Louisville',
    'America/Kentucky/Monticello',
    'America/Indiana/Indianapolis',
    'America/Indiana/Vincennes',
    'America/Indiana/Winamac',
    'America/Indiana/Marengo',
    'America/Indiana/Petersburg',
    'America/Indiana/Vevay',
    'America/Puerto_Rico'
  ) then 'America/New_York'
  when default_timezone in (
    'America/Chicago',
    'America/Indiana/Tell_City',
    'America/Indiana/Knox',
    'America/Menominee',
    'America/North_Dakota/Center',
    'America/North_Dakota/New_Salem',
    'America/North_Dakota/Beulah'
  ) then 'America/Chicago'
  when default_timezone in (
    'America/Denver',
    'America/Boise',
    'America/Phoenix'
  ) then 'America/Denver'
  when default_timezone = 'America/Los_Angeles' then 'America/Los_Angeles'
  when default_timezone in (
    'America/Anchorage',
    'America/Juneau',
    'America/Sitka',
    'America/Metlakatla',
    'America/Yakutat',
    'America/Nome'
  ) then 'America/Anchorage'
  when default_timezone in (
    'America/Adak',
    'Pacific/Honolulu',
    'Pacific/Guam',
    'Pacific/Saipan',
    'Pacific/Pago_Pago'
  ) then 'Pacific/Honolulu'
  when default_timezone is null then null
  else 'America/New_York'
end;

alter table public.profiles
  drop constraint if exists profiles_default_timezone_us_valid,
  add constraint profiles_default_timezone_us_valid
    check (
      default_timezone is null or default_timezone in (
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Anchorage',
        'Pacific/Honolulu'
      )
    );

alter table public.profiles
  drop constraint if exists profiles_experience_level_valid,
  drop column if exists experience_level;
