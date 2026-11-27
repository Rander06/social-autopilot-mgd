export type AIProvider = "GEMINI" | "OPENAI" | "CLAUDE";
export type ImageAIProvider = "GEMINI" | "OPENAI" | "OPENAI_MINI";
export type AspectRatio = "1:1" | "4:5" | "9:16";
export type PostFormat = "SINGLE" | "CAROUSEL";
export type ApprovalMode = "AUTO" | "DRAFT";

export interface PublishTargets {
  ig_feed: boolean;
  ig_stories: boolean;
  fb_feed: boolean;
  fb_stories: boolean;
  tiktok_feed: boolean;
}
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
  logo_dark_url?: string | null;
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
  tiktok_refresh_token_enc?: string | null;
  tiktok_expires_at?: string | null;
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
  publish_to_stories?: boolean;
  publish_targets?: PublishTargets;
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

export interface PostChannelOrganicMetrics {
  likes: number;
  comments: number;
  views?: number | null;
  reach?: number | null;
  saved?: number | null;
  shares?: number | null;
  permalink?: string | null;
  insights_available: boolean;
  error?: string | null;
}

export interface PostOrganicMetrics {
  ig?: PostChannelOrganicMetrics | null;
  fb?: PostChannelOrganicMetrics | null;
  total_likes: number;
  total_comments: number;
  total_views: number | null;
  total_reach: number | null;
  total_saved: number | null;
  total_shares: number | null;
  engagement_score: number;
  synced_at: string;
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
  story_image_urls?: string[];
  publish_targets?: PublishTargets;
  image_provider_used?: string | null;
  organic_metrics?: PostOrganicMetrics | null;
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
  story_image_urls_json?: string[];
  publish_targets?: PublishTargets;
  organic_metrics?: PostOrganicMetrics | null;
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

export type ImprovementTipStatus = "OPEN" | "COMPLETED";

export interface ImprovementTip {
  id: string;
  company_id: string;
  company_name: string;
  user_id?: string | null;
  user_name: string;
  user_email: string;
  message: string;
  status: ImprovementTipStatus;
  admin_reply?: string | null;
  completed_at?: string | null;
  client_seen_at?: string | null;
  created_at: string;
}

export type AdProvider = "META" | "TIKTOK";
export type AdChannel = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";
export type MetaAdObjective =
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_ENGAGEMENT";
export type AdCampaignStatus =
  | "DRAFT"
  | "PAUSED"
  | "ACTIVE"
  | "ARCHIVED"
  | "ERROR";
export type AdDecisionVerdict = "ESCALAR" | "MANTER" | "PAUSAR";
export type AdInsightsWindow = "4d" | "7d" | "14d" | "30d";

export interface AdInsightsDailyPoint {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
}

export interface AdInsightsWindowMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  conversions: number;
  revenue?: number;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
}

export interface AdInsightsSnapshot {
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  frequency?: number;
  conversions?: number;
  revenue?: number;
  cpl?: number | null;
  cpa?: number | null;
  roas?: number | null;
  creative_fatigue?: boolean;
  windows?: Partial<Record<AdInsightsWindow, AdInsightsWindowMetrics>>;
  daily?: AdInsightsDailyPoint[];
  raw_actions?: Array<{ action_type: string; value: string }>;
}

export interface AdAccountConfig {
  id: string;
  company_id: string;
  provider: AdProvider;
  ad_account_id: string;
  account_name: string;
  currency: string;
  account_status?: number | null;
  is_default: boolean;
  cpa_maximo: number;
  roas_minimo: number;
  amostra_minima_cliques: number;
  link_destino_padrao?: string | null;
  localizacao_base: string;
  auto_pause_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreativePostInput {
  postId: string;
  headline?: string | null;
  primaryText?: string | null;
}

export interface AdCampaignAdRecord {
  id: string;
  campaign_id: string;
  company_id: string;
  post_id?: string | null;
  ad_name: string;
  headline: string;
  primary_text: string;
  image_url?: string | null;
  story_image_url?: string | null;
  source_story_id?: string | null;
  meta_creative_id?: string | null;
  meta_ad_id?: string | null;
  status: AdCampaignStatus;
  last_verdict?: AdDecisionVerdict | null;
  last_verdict_reason?: string | null;
  last_insights_json: AdInsightsSnapshot;
  last_insights_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdCampaignRecord {
  id: string;
  company_id: string;
  post_id?: string | null;
  provider: AdProvider;
  channel: AdChannel;
  ad_account_id: string;
  name: string;
  user_prompt: string;
  objective: string;
  optimization_goal: string;
  destination_type?: string | null;
  daily_budget_cents: number;
  currency: string;
  duration_days?: number | null;
  targeting_json: Record<string, unknown>;
  source_story_id?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_creative_id?: string | null;
  meta_ad_id?: string | null;
  status: AdCampaignStatus;
  last_verdict?: AdDecisionVerdict | null;
  last_verdict_reason?: string | null;
  last_insights_json: AdInsightsSnapshot;
  last_insights_at?: string | null;
  error_message?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  ads?: AdCampaignAdRecord[];
}

export interface AdGeoLocationSelection {
  label: string;
  type:
    | "country"
    | "region"
    | "city"
    | "neighborhood"
    | "subcity"
    | "zip"
    | "custom_pin";
  key?: string;
  country_code?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
}

export interface ParsedCampaignPlan {
  name: string;
  objective: MetaAdObjective;
  optimization_goal: string;
  destination_type: string | null;
  daily_budget_cents: number;
  duration_days: number | null;
  location_query: string;
  location_radius_km?: number | null;
  selected_location?: AdGeoLocationSelection | null;
  start_time?: string | null;
  end_time?: string | null;
  no_end_date?: boolean;
  age_min: number;
  age_max: number;
  genders: Array<1 | 2>;
  destination_url: string | null;
  welcome_greeting?: string | null;
  welcome_autofill?: string | null;
  pixel_id?: string | null;
  url_tags?: string | null;
  reasoning: string;
  parser_provider: string;
}

export interface AdsAdvisorReport {
  generated_at: string;
  budget_recommendations: Array<{
    campaign_id?: string;
    campaign_name?: string;
    action: "ESCALAR" | "PAUSAR" | "MANTER" | "REALOCAR";
    title: string;
    reason: string;
  }>;
  creative_hooks: Array<{
    angle: string;
    headline_suggestion: string;
    hook_text: string;
    based_on_post_id?: string | null;
  }>;
  provider_used: string;
}
