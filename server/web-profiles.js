/**
 * Web Profiles — 3 target web apps for SkyourTest QC Platform
 * Each profile defines URL, roles with credentials, and test modules.
 */

const WEB_PROFILES = {
  competency: {
    id: 'competency',
    name: 'Competency Management',
    url: 'https://192.168.1.77:30052',
    icon: 'Briefcase',
    color: 'blue',
    description: 'Platform manajemen kompetensi dengan AI generate, assessment, dan reporting',
    roles: [
      { id: 'admin', label: 'Admin (Oki)', email: 'oki@beone-solution.com', password: '12345678' },
      { id: 'user', label: 'User (Irfan)', email: 'irfan@beone-solution.com', password: '12345678' },
    ],
    modules: [
      'login', 'dashboard', 'navigation', 'structure', 'security',
      'form_validation', 'responsive', 'performance',
      'crud_employee', 'crud_kompetensi', 'test_assessment', 'payment_booking', 'notification_integration', 'report_export',
    ],
    features: [
      'login_sso_jwt', 'oauth', 'register', 'reset_password',
      'role_crud', 'user_crud', 'divisi_crud', 'employee_crud',
      'master_kompetensi', 'ai_generate_kompetensi', 'form_kompetensi_user', 'result_competency',
      'dashboard_admin', 'dashboard_report', 'dashboard_peserta',
      'test_dimensi', 'bank_soal_ai', 'import_excel_soal', 'navigasi_test', 'test_kamera',
      'setting_price', 'payment_gateway', 'kode_referal', 'booking_referal',
      'notif_email', 'upload_oss', 'foto_profile_oss', 'recording_zoom',
      'cancellation', 'reschedule', 'integrasi_ai',
      'report_pdf', 'logo_pt_report', 'layout_report',
      'crud_norm_group', 'crud_norm_table',
    ],
  },

  psikotest: {
    id: 'psikotest',
    name: 'Psikotest Platform',
    url: 'https://192.168.1.77:30055/login',
    icon: 'Brain',
    color: 'purple',
    description: 'Platform asesmen psikologi dengan multi-role, AI generate, dan booking consultant',
    roles: [
      { id: 'admin', label: 'Admin', email: 'admin@psikotest.id', password: 'admin123' },
      { id: 'useradmin', label: 'User Admin', email: 'useradmin@gmail.com', password: '12345678' },
      { id: 'user', label: 'User', email: 'user@gmail.com', password: '12345678' },
      { id: 'psikolog', label: 'Psikolog', email: 'psikolog@psikotest.id', password: 'psikolog123' },
    ],
    modules: [
      'login', 'dashboard', 'navigation', 'structure', 'security',
      'form_validation', 'responsive', 'performance',
      'crud_master', 'test_assessment', 'ai_integration', 'booking_consultant', 'result_report',
    ],
    features: [
      'login_per_role', 'home_page',
      'test_dimensi', 'dashboard_peserta', 'mulai_ujian',
      'dashboard_admin', 'dashboard_report',
      'result_competency', 'form_kompetensi_user',
      'booking_consultant', 'consultant_set_jadwal', 'consultant_update_done', 'result_halaman',
      'navigasi_test', 'test_kamera',
      'integrasi_ai', 'bank_soal_ai', 'kompetensi_ai', 'master_kompetensi',
    ],
  },

  consultant: {
    id: 'consultant',
    name: 'Consultant Platform',
    url: 'https://192.168.1.77:30056/',
    icon: 'Users',
    color: 'green',
    description: 'Platform konsultasi dengan booking, payment, dan multi-role (admin, client, consultant)',
    roles: [
      { id: 'admin', label: 'Admin', email: 'admin@konsulta.id', password: 'admin123' },
      { id: 'client', label: 'Client (Budi)', email: 'budi@konsulta.id', password: 'client123' },
      { id: 'consultant', label: 'Consultant (Andi)', email: 'andi@konsulta.id', password: 'consultant123' },
    ],
    modules: [
      'login', 'landing_page', 'dashboard', 'navigation', 'structure', 'security',
      'form_validation', 'responsive', 'performance',
      'profile_management', 'booking_schedule', 'payment_referal', 'notification', 'report_export',
    ],
    features: [
      'landing_page', 'profile_consultant', 'register_consultant', 'profil_client',
      'login', 'register', 'reset_password', 'oauth',
      'faq', 'home_page',
      'booking_consultant', 'consultant_set_jadwal', 'consultant_update_done',
      'kode_referal', 'booking_referal', 'payment_gateway',
      'notif_email', 'cancellation', 'reschedule',
      'dashboard_admin', 'dashboard_report',
    ],
  },
};

// Module metadata for UI display
const MODULE_INFO = {
  // Common modules
  login: { label: 'Login & Auth', desc: 'Login per role, SSO, JWT, OAuth, register, reset password, session, logout' },
  dashboard: { label: 'Dashboard', desc: 'Dashboard admin/peserta, cards, widgets, report, user info' },
  navigation: { label: 'Navigation & Menu', desc: 'Nav links, sidebar, breadcrumb, deep link, footer' },
  structure: { label: 'Structure & Layout', desc: 'HTML lang, viewport, heading hierarchy, semantic HTML' },
  security: { label: 'Security & Hack', desc: 'Headers, CSRF, XSS, SQL injection, IDOR, cookie, permission boundary' },
  form_validation: { label: 'Form & Input', desc: 'Required fields, email validation, edge cases, label association' },
  responsive: { label: 'Responsive & Mobile', desc: 'Mobile, tablet, desktop, touch targets, overflow' },
  performance: { label: 'Performance & Network', desc: 'Load time, network errors, console errors, API response' },

  // Competency-specific
  crud_employee: { label: 'CRUD Employee/Divisi/Role', desc: 'Create, read, update, delete employee, divisi, role, user' },
  crud_kompetensi: { label: 'CRUD Kompetensi', desc: 'Master kompetensi, form kompetensi, AI generate, result' },
  test_assessment: { label: 'Test & Assessment', desc: 'Test+dimensi, bank soal, import excel, navigasi, kamera' },
  payment_booking: { label: 'Payment & Booking', desc: 'Setting price, payment gateway, kode referal, booking' },
  notification_integration: { label: 'Notification & Integration', desc: 'Email notif, OSS upload, recording/zoom, AI integration' },
  report_export: { label: 'Report & Export', desc: 'Report PDF, logo+PT dinamis, layout report' },

  // Psikotest-specific
  crud_master: { label: 'CRUD Master Data', desc: 'Master kompetensi, bank soal, dimensi, norm group/table' },
  ai_integration: { label: 'AI Integration', desc: 'AI generate kompetensi, AI generate soal, integrasi AI' },
  booking_consultant: { label: 'Booking Consultant', desc: 'Booking, set jadwal, update done, result halaman' },
  result_report: { label: 'Result & Report', desc: 'Result kompetensi, form kompetensi user, dashboard report' },

  // Consultant-specific
  landing_page: { label: 'Landing Page', desc: 'Landing page content, CTA, FAQ, home page' },
  profile_management: { label: 'Profile Management', desc: 'Profile consultant, profil client, foto profile' },
  booking_schedule: { label: 'Booking & Schedule', desc: 'Booking, set jadwal, update done, cancellation, reschedule' },
  payment_referal: { label: 'Payment & Referal', desc: 'Payment gateway, kode referal, booking dengan referal' },
  notification: { label: 'Notification', desc: 'Email notif, notif system' },
};

module.exports = { WEB_PROFILES, MODULE_INFO };
