-- ==============================================================================
-- إصلاح شامل لجدول رسائل الوساطة (deal_messages) وجدول الصفقات (deals)
-- وتفعيل اشتراك Supabase Realtime وسياسات الأمان (RLS)
-- ==============================================================================

-- 1. التأكد من دالة التحقق من المدير (الوسيط المعتمد)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or lower(email) in ('fgkano63@gmail.com', 'saadani2009@gmail.com')
      )
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) in ('fgkano63@gmail.com', 'saadani2009@gmail.com');
$$;

-- 2. التأكد من وجود جدول رسائل الصفقات (deal_messages) بكافة أعمدته
create table if not exists public.deal_messages (
    id uuid primary key default gen_random_uuid(),
    deal_id text not null references public.deals(id) on delete cascade,
    sender_id uuid not null references public.profiles(id) on delete cascade,
    channel_type text not null default 'all' check (channel_type in ('buyer_mediator', 'seller_mediator', 'system', 'all')),
    sender_role text not null default 'buyer' check (sender_role in ('buyer', 'seller', 'mediator', 'system')),
    message text not null,
    attachments jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. منح الصلاحيات للمستخدمين المسجلين على جدولي deal_messages و deals
grant select, insert, update, delete on table public.deal_messages to authenticated;
grant all on table public.deal_messages to service_role;

grant select, insert, update, delete on table public.deals to authenticated;
grant all on table public.deals to service_role;

-- 4. تفعيل RLS وتحديث سياسات جدول deal_messages
alter table public.deal_messages enable row level security;

drop policy if exists "messages_select_policy" on public.deal_messages;
drop policy if exists "messages_insert_policy" on public.deal_messages;
drop policy if exists "deal_messages_admin_all" on public.deal_messages;
drop policy if exists "deal_messages_participants_select" on public.deal_messages;
drop policy if exists "deal_messages_participants_insert" on public.deal_messages;

-- أ) صلاحية شاملة للمدير (الوسيط المعتمد) لقراءة وإرسال وتعديل وحذف كافة رسائل الصفقات
create policy "deal_messages_admin_all"
on public.deal_messages
for all
to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- ب) صلاحية القراءة لأطراف الصفقة (المشتري والبائع يقرأون رسائل صفقتهم أو الرسائل التي أرسلوها)
create policy "deal_messages_participants_select"
on public.deal_messages
for select
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1 from public.deals d
    where d.id = deal_messages.deal_id
      and (
        (d.buyer_id = auth.uid() and deal_messages.channel_type in ('buyer_mediator', 'all', 'system'))
        or
        (d.seller_id = auth.uid() and deal_messages.channel_type in ('seller_mediator', 'all', 'system'))
      )
  )
);

-- ج) صلاحية الإرسال (INSERT) لأطراف الصفقة (المشتري أو البائع أو الوسيط)
create policy "deal_messages_participants_insert"
on public.deal_messages
for insert
to authenticated
with check (
  public.is_admin()
  or (
    sender_id = auth.uid()
    and exists (
      select 1 from public.deals d
      where d.id = deal_messages.deal_id
        and (d.buyer_id = auth.uid() or d.seller_id = auth.uid())
    )
  )
);

-- 5. التأكد من سياسات جدول deals للسماح بحفظ وتحديث رسائل وحالة الصفقة
alter table public.deals enable row level security;

drop policy if exists "deals_admin_all" on public.deals;
create policy "deals_admin_all"
on public.deals
for all
to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

drop policy if exists "deals_select_participants_or_admin" on public.deals;
create policy "deals_select_participants_or_admin"
on public.deals
for select
to authenticated
using (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

drop policy if exists "deals_insert_policy" on public.deals;
create policy "deals_insert_policy"
on public.deals
for insert
to authenticated
with check (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

drop policy if exists "deals_update_policy" on public.deals;
create policy "deals_update_policy"
on public.deals
for update
to authenticated
using (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
)
with check (
  buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
);

-- 6. تفعيل Supabase Realtime على جدولي deal_messages و deals
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deal_messages'
  ) then
    alter publication supabase_realtime add table public.deal_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deals'
  ) then
    alter publication supabase_realtime add table public.deals;
  end if;
exception when others then
  null;
end $$;

-- 7. تحديث الكاش الخاص بـ PostgREST
notify pgrst, 'reload schema';
