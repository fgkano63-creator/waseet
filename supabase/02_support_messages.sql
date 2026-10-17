-- ==============================================================================
-- WASEET Platform - جدول رسائل الدعم والمحادثة المباشرة مع الوسيط/المدير
-- ==============================================================================
-- هذا الجدول يُتيح للمستخدمين التواصل الفوري المباشر مع الوسيط المعتمد (المدير)
-- دون الحاجة لوجود صفقة نشطة، مع حماية RLS ومزامنة Supabase Realtime اللحظية.
-- ==============================================================================

-- 1. إنشاء جدول support_messages
create table if not exists public.support_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    sender_role text not null check (sender_role in ('user', 'admin')),
    message text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- فهرس لتسريع استعلامات المحادثات حسب المستخدم والوقت
create index if not exists idx_support_messages_user_created 
on public.support_messages(user_id, created_at asc);

-- 2. ضبط الأذونات
grant select, insert on table public.support_messages to authenticated;
grant all on table public.support_messages to service_role;

-- 3. تفعيل أمان الصفوف (Row Level Security - RLS)
alter table public.support_messages enable row level security;

-- 4. سياسات RLS:
-- سياسة القراءة (SELECT): المستخدم العادي يرى رسائله فقط، والمدير (Admin) يرى كافة الرسائل
drop policy if exists "support_messages_select_policy" on public.support_messages;
create policy "support_messages_select_policy"
on public.support_messages for select to authenticated
using (
    auth.uid() = user_id or public.is_admin()
);

-- سياسة الإرسال (INSERT):
-- المستخدم العادي يرسل لنفسه فقط وبصفة 'user'
-- المدير (Admin) يُرسل لأي مستخدم وبصفة 'admin'
drop policy if exists "support_messages_insert_policy" on public.support_messages;
create policy "support_messages_insert_policy"
on public.support_messages for insert to authenticated
with check (
    (auth.uid() = user_id and sender_role = 'user')
    or (public.is_admin() and sender_role = 'admin')
);

-- 5. تفعيل البث اللحظي الفوري (Supabase Realtime)
-- يُمكّن كلاً من المستخدم والمدير من استلام الردود والرسائل الجديدة فوراً دون إعادة تحميل الصفحة
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
      and schemaname = 'public' 
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;
