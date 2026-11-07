/**
 * tests/test-profile-dashboard-and-ui-libraries.js
 * Verification of Profile Dashboard, Avatar/Name updates, and Skiper/Vengeance/Animata UI integration.
 */

const fs = require('fs');
const path = require('path');

function assert(condition, message) {
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        process.exit(1);
    }
    console.log(`[PASS] ${message}`);
}

const ROOT = path.resolve(__dirname, '..');

// 1. Check Migration 29 exists and configures avatars storage bucket & RLS
const migPath = path.join(ROOT, 'supabase', '29_avatars_storage_and_profile_editing.sql');
assert(fs.existsSync(migPath), 'Migration 29 (avatars storage & profile editing) exists');
const migContent = fs.readFileSync(migPath, 'utf8');
assert(migContent.includes("'avatars'"), 'Migration 29 defines avatars storage bucket');
assert(migContent.includes('grant update (name, avatar_url) on table public.profiles'), 'Migration 29 grants name and avatar_url updates to authenticated');
assert(migContent.includes('avatars_authenticated_insert'), 'Migration 29 defines authenticated upload policy');

// 2. Check CSS includes Skiper, Vengeance, and Animata classes
const cssPath = path.join(ROOT, 'css', 'style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
assert(cssContent.includes('.animata-glow-card'), 'css/style.css defines .animata-glow-card');
assert(cssContent.includes('.skiper-bento-grid'), 'css/style.css defines .skiper-bento-grid');
assert(cssContent.includes('.skiper-balance-card'), 'css/style.css defines .skiper-balance-card');
assert(cssContent.includes('.animata-shimmer-btn'), 'css/style.css defines .animata-shimmer-btn');
assert(cssContent.includes('.vengeance-stat-card'), 'css/style.css defines .vengeance-stat-card');
assert(cssContent.includes('.profile-avatar-uploader-container'), 'css/style.css defines .profile-avatar-uploader-container');

// 3. Check js/supabase.js exports updateProfileName and uploadProfileAvatar
const supabaseJsPath = path.join(ROOT, 'js', 'supabase.js');
const supabaseJs = fs.readFileSync(supabaseJsPath, 'utf8');
assert(supabaseJs.includes('window.waseetUpdateProfileName = waseetUpdateProfileName;'), 'supabase.js exports window.waseetUpdateProfileName');
assert(supabaseJs.includes('window.waseetUploadProfileAvatar = waseetUploadProfileAvatar;'), 'supabase.js exports window.waseetUploadProfileAvatar');
assert(supabaseJs.includes("from('avatars')"), 'supabase.js handles avatars bucket storage upload');
assert(supabaseJs.includes("readAsDataURL"), 'supabase.js includes resilient data-url fallback for avatar');

// 4. Check profile.html features
const profilePath = path.join(ROOT, 'profile.html');
const profileHtml = fs.readFileSync(profilePath, 'utf8');
assert(profileHtml.includes('id="profile-avatar-file-input"'), 'profile.html has file input for avatar');
assert(profileHtml.includes('ProfileStore.handleAvatarFileSelect'), 'profile.html wires handleAvatarFileSelect');
assert(profileHtml.includes('handleAvatarFileSelect,'), 'ProfileStore exports handleAvatarFileSelect');
assert(profileHtml.includes('animata-glow-card'), 'profile.html utilizes animata-glow-card');
assert(profileHtml.includes('vengeance-stat-card'), 'profile.html utilizes vengeance-stat-card');

// 5. Check Navigation Triggers in js/app.js & js/navbar.js
const appJsPath = path.join(ROOT, 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');
assert(appJs.includes("onclick=\"window.location.href='profile.html'\""), 'app.js navigates to profile.html from header pill');
assert(appJs.includes("window.location.href = 'profile.html'"), 'app.js navigates to profile.html from drawer user card');

const navbarJsPath = path.join(ROOT, 'js', 'navbar.js');
const navbarJs = fs.readFileSync(navbarJsPath, 'utf8');
assert(navbarJs.includes("profile.html"), 'navbar.js navigates to profile.html');

// 6. Check index.html integration of modern glowing components
const indexHtmlPath = path.join(ROOT, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
assert(indexHtml.includes('calc-card animata-glow-card'), 'index.html applies animata-glow-card to fee calculator');
assert(indexHtml.includes('leaderboard-card-3d animata-glow-card'), 'index.html applies animata-glow-card to leaderboard');

// 7. Check Account Details Modal Close Button UI Safety (z-index 9999, contrast & overflow visible)
assert(cssContent.includes('#btn-close-card-deck') && cssContent.includes('.store-modal-close'), 'css/style.css targets account details close buttons');
assert(cssContent.includes('z-index: 9999 !important;'), 'css/style.css elevates close buttons with z-index 9999');
assert(cssContent.includes('overflow: visible !important;'), 'css/style.css ensures modal headers do not clip close buttons');
assert(profileHtml.includes('.store-modal-close') && profileHtml.includes('z-index: 9999 !important;'), 'profile.html elevates .store-modal-close with z-index 9999');

console.log('\n>>> ALL PROFILE DASHBOARD & UI LIBRARIES AUDITS PASSED (100%) <<<');
