export type AIProvider = "GEMINI" | "OPENAI" | "CLAUDE";
export type ImageAIProvider = "GEMINI" | "OPENAI" | "OPENAI_MINI";
export type AspectRatio = "1:1" | "4:5" | "9:16";
export type PostFormat = "SINGLE" | "CAROUSEL";
export type ApprovalMode = "AUTO" | "DRAFT";
export type AIPhotoMode =
  | "NONE"
  | "ENHANCE"
  | "ORIGINAL_FRAME"
  | "EDITORIAL_MOCKUP"
  | "AI_FULL_CREATIVE"
  | "RAW_ART";
export type CompanyStatus = "ACTIVE" | "TRIAL" | "PAST_DUE" | "BLOCKED";
export type UserRole = "SUPER_ADMIN" | "COMPANY_ADMIN";
export type PostStatus = "PENDING_APPROVAL" | "PUBLISHED" | "ERROR";

export interface Plan {
  id: string;
  name: string;
  price_brl: number;
  max_posts_month: number;
  allow_carousel: boolean;
  allow_ai_photo: boolean;
  allow_multi_ai: boolean;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan_id: string;
  status: CompanyStatus;
  expires_at: string;
  posts_used_month: number;
  owner_name?: string;
  owner_whatsapp?: string;
  created_at: string;
}

export interface UserAccount {
  id: string;
  company_id: string | null;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  last_login_at?: string | null;
  created_at: string;
}

export interface BrandSettings {
  company_id: string;
  theme_preset: string;
  footer_name: string;
  subtitle_default: string;
  cta_default: string;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  bg_color: string;
  text_color: string;
}

export interface CompanyIntegrations {
  company_id: string;
  preferred_text_ai: AIProvider;
  preferred_image_ai: ImageAIProvider;
  gemini_key_enc?: string | null;
  openai_key_enc?: string | null;
  anthropic_key_enc?: string | null;
  meta_token_enc?: string | null;
  meta_token_expires_at?: string | null;
  ig_user_id?: string | null;
  fb_page_id?: string | null;
  r2_account_id?: string | null;
  r2_access_key_id_enc?: string | null;
  r2_secret_access_key_enc?: string | null;
  r2_bucket_name?: string | null;
  r2_public_url?: string | null;
  tiktok_token_enc?: string | null;
  tiktok_open_id?: string | null;
  tiktok_enabled: boolean;
  allow_image_ai_fallback?: boolean;
}

export interface CompanyIntegrationsPublic {
  company_id: string;
  preferred_text_ai: AIProvider;
  preferred_image_ai: ImageAIProvider;
  has_gemini_key: boolean;
  gemini_key_mask: string;
  has_openai_key: boolean;
  openai_key_mask: string;
  has_anthropic_key: boolean;
  anthropic_key_mask: string;
  has_meta_token: boolean;
  meta_token_mask: string;
  meta_token_expires_at: string | null;
  ig_user_id: string;
  fb_page_id: string;
  r2_account_id: string;
  has_r2_access_key: boolean;
  r2_access_key_mask: string;
  has_r2_secret_key: boolean;
  r2_secret_key_mask: string;
  r2_bucket_name: string;
  r2_public_url: string;
  using_global_r2_fallback: boolean;
  has_tiktok_token: boolean;
  tiktok_open_id: string;
  tiktok_enabled: boolean;
  allow_image_ai_fallback: boolean;
}

export interface Topic {
  id: string;
  company_id: string;
  title: string;
  niche_template: string;
  prompt_instructions: string;
  offer_price?: string | null;
  benefits_json: string[];
  post_format: PostFormat;
  slides_count: number;
  aspect_ratio: AspectRatio;
  approval_mode: ApprovalMode;
  ai_photo_mode: AIPhotoMode;
  ai_photo_prompt?: string | null;
  preferred_image_ai?: ImageAIProvider | null;
  schedule_days: number[];
  schedule_time: string;
  schedule_times?: string[];
  is_active: boolean;
  last_posted_at?: string | null;
  created_at: string;
}

export interface TopicPhoto {
  id: string;
  topic_id: string;
  company_id: string;
  original_url: string;
  enhanced_url?: string | null;
  ai_prompt_used?: string | null;
  times_used: number;
  last_used_at?: string | null;
  created_at: string;
}

export interface GeneratedSlideContent {
  badge: string;
  title: string;
  body: string;
  highlight?: string;
}

export interface GeneratedContentPayload {
  tema_visual: string;
  headline_arte: string;
  subtitulo_arte: string;
  dor_vs_solucao: string;
  destaque_selo: string;
  beneficios: string[];
  slides: GeneratedSlideContent[];
  legenda: string;
  hashtags: string;
  original_photo_url?: string | null;
  enhanced_photo_url?: string | null;
}

export interface PostHistoryItem {
  id: string;
  company_id: string;
  topic_id?: string | null;
  topic_title?: string;
  ai_provider_used?: string | null;
  format: PostFormat;
  aspect_ratio: AspectRatio;
  slides_count: number;
  headline: string;
  content_json: GeneratedContentPayload;
  image_urls_json: string[];
  ig_post_id?: string | null;
  fb_post_id?: string | null;
  tiktok_post_id?: string | null;
  status: PostStatus;
  logs_json: string[];
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  company_id?: string | null;
  company_name?: string;
  user_id?: string | null;
  user_email?: string;
  action: string;
  details_json: Record<string, unknown>;
  created_at: string;
}
