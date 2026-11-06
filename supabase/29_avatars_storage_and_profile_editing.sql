-- ==============================================================================
-- WASEET Platform - Migration 29: Avatars Storage & Profile Real-time Editing
-- ==============================================================================
-- هذا الملف ينشئ سلة تخزين الصور الرمزية (avatars bucket) ويضبط سياسات RLS للتخزين
-- ويضمن صلاحيات تعديل الاسم والصورة للمستخدمين المصرحين على جدول profiles.
-- آمن لإعادة التشغيل (Idempotent).
-- ==============================================================================

-- 1. التأكد من صلاحيات تحديث الاسم والصورة في جدول profiles
grant select on table public.profiles to authenticated;
grant update (name, avatar_url) on table public.profiles to authenticated;

-- 2. إنشاء سلة تخزين الصور الشخصية avatars إذا لم تكن موجودة
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    true,
    5242880, -- 5MB كحد أقصى لكل صورة
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

-- 3. سياسات أمان سلة التخزين (Storage RLS Policies)

-- أ) سياسة القراءة: متاحة للعامة حتى تظهر صور المستخدمين في كامل المنصة
drop policy if exists "avatars_public_select" on storage.objects;
create policy "avatars_public_select"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

-- ب) سياسة الرفع: المستخدم المسجل فقط يرفع صورته في المجلد الخاص به أو تحت اسمه
drop policy if exists "avatars_authenticated_insert" on storage.objects;
create policy "avatars_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
);

-- ج) سياسة التعديل: المستخدم يعدل فقط ملفاته داخل سلة avatars
drop policy if exists "avatars_authenticated_update" on storage.objects;
create policy "avatars_authenticated_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
)
with check (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
);

-- د) سياسة الحذف: المستخدم يمكنه حذف صورته القديمة
drop policy if exists "avatars_authenticated_delete" on storage.objects;
create policy "avatars_authenticated_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
);
