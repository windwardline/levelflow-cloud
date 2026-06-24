-- Rename legacy provider vocabulary now that LevelFlow uses provider-neutral
-- market data plumbing.

do $$
begin
  if to_regclass('public.pending_orders') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pending_orders'
        and column_name = 'massive_symbol'
    ) and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pending_orders'
        and column_name = 'provider_symbol'
    ) then
      alter table public.pending_orders
        rename column massive_symbol to provider_symbol;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pending_orders'
        and column_name = 'massive_symbol'
    ) then
      update public.pending_orders
      set provider_symbol = coalesce(provider_symbol, massive_symbol)
      where provider_symbol is null;

      alter table public.pending_orders
        drop column massive_symbol;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pending_orders'
        and column_name = 'provider_symbol'
    ) then
      alter table public.pending_orders
        add column provider_symbol text;
    end if;

    update public.pending_orders
    set provider_symbol = symbol
    where provider_symbol is null;

    alter table public.pending_orders
      alter column provider_symbol set not null;
  end if;

  if to_regclass('public.trade_setups') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'trade_setups'
        and column_name = 'massive_symbol'
    ) and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'trade_setups'
        and column_name = 'provider_symbol'
    ) then
      alter table public.trade_setups
        rename column massive_symbol to provider_symbol;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'trade_setups'
        and column_name = 'massive_symbol'
    ) then
      update public.trade_setups
      set provider_symbol = coalesce(provider_symbol, massive_symbol)
      where provider_symbol is null;

      alter table public.trade_setups
        drop column massive_symbol;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'trade_setups'
        and column_name = 'provider_symbol'
    ) then
      alter table public.trade_setups
        add column provider_symbol text;
    end if;

    update public.trade_setups
    set provider_symbol = symbol
    where provider_symbol is null;

    alter table public.trade_setups
      alter column provider_symbol set not null;
  end if;
end $$;
