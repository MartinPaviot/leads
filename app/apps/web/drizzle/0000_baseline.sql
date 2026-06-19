-- 0000_baseline.sql
-- Squashed baseline generated from the leadsens-dev (prod) public schema.
-- Replaces the 81 legacy migrations for from-scratch rebuilds.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- (baseline) search_path left at default
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- (baseline) public already exists on a fresh DB
--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_type AS ENUM (
    'email_sent',
    'email_received',
    'email_opened',
    'email_replied',
    'email_bounced',
    'meeting_scheduled',
    'meeting_completed',
    'meeting_cancelled',
    'call_completed',
    'note_created',
    'note_updated',
    'task_created',
    'task_completed',
    'deal_created',
    'deal_stage_changed',
    'deal_won',
    'deal_lost',
    'contact_created',
    'company_created',
    'sequence_enrolled',
    'sequence_step_sent',
    'sequence_completed',
    'sequence_replied',
    'website_visited',
    'form_submitted',
    'enrichment_updated',
    'score_changed',
    'system_event'
);


--
-- Name: agent_trace_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.agent_trace_status AS ENUM (
    'ok',
    'error',
    'timeout',
    'corrected'
);


--
-- Name: call_campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_campaign_status AS ENUM (
    'active',
    'paused',
    'completed',
    'archived'
);


--
-- Name: call_outcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_outcome AS ENUM (
    'connected',
    'voicemail_left',
    'no_answer',
    'busy',
    'gatekeeper',
    'wrong_number',
    'do_not_call',
    'meeting_booked',
    'callback_requested',
    'not_interested',
    'failed'
);


--
-- Name: call_target_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_target_status AS ENUM (
    'queued',
    'in_progress',
    'connected',
    'converted',
    'exhausted',
    'dnc'
);


--
-- Name: channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.channel AS ENUM (
    'email',
    'meeting',
    'call',
    'web',
    'system',
    'manual'
);


--
-- Name: deal_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deal_stage AS ENUM (
    'lead',
    'qualification',
    'demo',
    'trial',
    'proposal',
    'negotiation',
    'won',
    'lost'
);


--
-- Name: direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.direction AS ENUM (
    'inbound',
    'outbound',
    'internal'
);


--
-- Name: enrollment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enrollment_status AS ENUM (
    'active',
    'paused',
    'completed',
    'replied',
    'bounced',
    'unsubscribed'
);


--
-- Name: mailbox_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mailbox_status AS ENUM (
    'warming_up',
    'active',
    'paused',
    'disabled',
    'error'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'deal_risk',
    'deal_won',
    'deal_lost',
    'enrichment_done',
    'sequence_reply',
    'task_due',
    'task_assigned',
    'meeting_upcoming',
    'new_contact',
    'system'
);


--
-- Name: outbound_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.outbound_status AS ENUM (
    'draft',
    'queued',
    'sending',
    'sent',
    'delivered',
    'bounced',
    'failed',
    'skipped'
);


--
-- Name: pipeline_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pipeline_stage AS ENUM (
    'enriched',
    'signal_detected',
    'enrolled',
    'email_generated',
    'email_queued',
    'email_sent',
    'email_delivered',
    'email_opened',
    'email_clicked',
    'email_replied',
    'email_bounced',
    'meeting_booked',
    'deal_created',
    'deal_won',
    'deal_lost'
);


--
-- Name: prompt_experiment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.prompt_experiment_status AS ENUM (
    'active',
    'concluded',
    'canceled'
);


--
-- Name: sentiment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sentiment AS ENUM (
    'positive',
    'neutral',
    'negative'
);


--
-- Name: sequence_draft_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sequence_draft_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'expired',
    'sent'
);


--
-- Name: sequence_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sequence_status AS ENUM (
    'draft',
    'active',
    'paused',
    'archived'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid'
);


--
-- Name: usage_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.usage_event_type AS ENUM (
    'api_call',
    'email_sent',
    'contact_enriched',
    'ai_query'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __elevay_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.__elevay_migrations (
    filename text NOT NULL,
    hash text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_health_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_health_snapshots (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    account_id text NOT NULL,
    health_score integer NOT NULL,
    components jsonb NOT NULL,
    risk_level text NOT NULL,
    suggested_action text,
    suggested_action_reason text,
    arr_exposure_usd double precision,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_suppressions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    entity_type text DEFAULT 'company'::text NOT NULL,
    company_id text,
    kind text NOT NULL,
    reason text,
    domain text,
    name_normalized text,
    native_id text,
    native_id_type text,
    email text,
    linkedin text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: action_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_outcomes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    action_id text NOT NULL,
    reaction_id text,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action_type text NOT NULL,
    expected_outcome text NOT NULL,
    observation_window_hours integer DEFAULT 168 NOT NULL,
    status text DEFAULT 'watching'::text NOT NULL,
    outcome_type text,
    positivity real,
    time_to_outcome_hours real,
    outcome_metadata jsonb DEFAULT '{}'::jsonb,
    trigger_type text,
    entity_snapshot jsonb DEFAULT '{}'::jsonb,
    watching_since timestamp with time zone DEFAULT now() NOT NULL,
    window_expires_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id text NOT NULL,
    tenant_id text NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    activity_type public.activity_type NOT NULL,
    channel public.channel,
    direction public.direction,
    occurred_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    summary text,
    raw_content text,
    sentiment public.sentiment,
    created_at timestamp with time zone DEFAULT now(),
    thread_id text,
    intent text[],
    deleted_at timestamp with time zone,
    body_tsvector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((COALESCE(raw_content, ''::text) || ' '::text) || COALESCE(summary, ''::text)))) STORED
);


--
-- Name: admin_alert_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_alert_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    rule_id text NOT NULL,
    current_value real NOT NULL,
    threshold real NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    acknowledged_at timestamp with time zone,
    acknowledged_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_alert_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_alert_rules (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    agent_id text NOT NULL,
    metric text NOT NULL,
    operator text NOT NULL,
    threshold real NOT NULL,
    window_minutes integer DEFAULT 60 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    last_triggered_at timestamp with time zone,
    created_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    user_email text NOT NULL,
    action text NOT NULL,
    resource text NOT NULL,
    resource_id text,
    before_snapshot jsonb,
    after_snapshot jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    jwt_id text NOT NULL,
    ip_address text,
    user_agent text,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ae_performance_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ae_performance_snapshots (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    emails_sent integer DEFAULT 0,
    emails_replied integer DEFAULT 0,
    meetings_booked integer DEFAULT 0,
    meetings_completed integer DEFAULT 0,
    deals_created integer DEFAULT 0,
    deals_advanced integer DEFAULT 0,
    deals_won integer DEFAULT 0,
    deals_lost integer DEFAULT 0,
    avg_tone_score real,
    avg_completeness_score real,
    avg_objection_handling_score real,
    avg_process_adherence_score real,
    avg_response_time_minutes real,
    win_rate real,
    overall_score real,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_actions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text,
    action_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    scheduled_execution_at timestamp with time zone,
    executed_at timestamp with time zone,
    reversed_at timestamp with time zone,
    reversed_by_user_id text,
    reversible_until timestamp with time zone,
    status text DEFAULT 'scheduled'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_actions_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'executed'::text, 'reversed'::text, 'failed'::text])))
);


--
-- Name: agent_failure_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_failure_patterns (
    id text NOT NULL,
    agent_id text NOT NULL,
    pattern_type text NOT NULL,
    description text NOT NULL,
    frequency integer DEFAULT 1,
    example_trace_ids jsonb DEFAULT '[]'::jsonb,
    resolution text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_few_shot_examples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_few_shot_examples (
    id text NOT NULL,
    agent_id text NOT NULL,
    input text NOT NULL,
    output text NOT NULL,
    eval_score real NOT NULL,
    source_trace_id text,
    is_active boolean DEFAULT true,
    tags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_prompt_versions (
    id text NOT NULL,
    agent_id text NOT NULL,
    version integer NOT NULL,
    system_prompt text NOT NULL,
    change_reason text,
    parent_version_id text,
    eval_score real,
    eval_pass_rate real,
    is_active boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    canary_percent integer DEFAULT 0 NOT NULL
);


--
-- Name: agent_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_reactions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    trigger text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    deduplication_key text NOT NULL,
    context_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions_taken integer DEFAULT 0 NOT NULL,
    actions_deferred integer DEFAULT 0 NOT NULL,
    actions_skipped integer DEFAULT 0 NOT NULL,
    processing_time_ms integer,
    model_used text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tasks (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'queued'::text NOT NULL,
    progress_current integer DEFAULT 0 NOT NULL,
    progress_total integer,
    progress_message text,
    result jsonb,
    error text,
    chat_thread_id text,
    chat_message_id text,
    inngest_event_id text,
    checkpoint jsonb,
    depends_on jsonb DEFAULT '[]'::jsonb,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_traces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_traces (
    id text NOT NULL,
    tenant_id text,
    agent_id text NOT NULL,
    agent_category text NOT NULL,
    trace_id text,
    parent_span_id text,
    input text,
    output text,
    model text,
    status public.agent_trace_status DEFAULT 'ok'::public.agent_trace_status NOT NULL,
    input_tokens integer,
    output_tokens integer,
    estimated_cost real,
    latency_ms integer,
    tool_calls jsonb DEFAULT '[]'::jsonb,
    tool_calls_count integer DEFAULT 0,
    error_message text,
    correction_applied text,
    eval_score real,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_work_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_work_items (
    id text NOT NULL,
    tenant_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    entity_label text NOT NULL,
    strategy text NOT NULL,
    strategy_reasoning text NOT NULL,
    strategy_set_at timestamp with time zone NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    priority_reasoning text,
    next_action text,
    next_action_detail text,
    next_action_at timestamp with time zone,
    last_agent_action_id text,
    last_evaluated_at timestamp with time zone,
    evaluation_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    archived_reason text,
    archived_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: anonymized_signal_benchmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anonymized_signal_benchmarks (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    industry text NOT NULL,
    company_size text NOT NULL,
    signal_type text NOT NULL,
    outcome_rate real NOT NULL,
    tenant_count integer NOT NULL,
    total_observations integer DEFAULT 0 NOT NULL,
    avg_deal_cycle_days real,
    aggregated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_account (
    "userId" text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


--
-- Name: auth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_session (
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp without time zone NOT NULL
);


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_user (
    id text NOT NULL,
    name text,
    email text,
    "emailVerified" timestamp without time zone,
    image text,
    password_hash text,
    password_changed_at timestamp without time zone
);


--
-- Name: auth_verificationToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."auth_verificationToken" (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp without time zone NOT NULL
);


--
-- Name: autonomy_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autonomy_config (
    tenant_id text NOT NULL,
    level text DEFAULT 'copilot'::text NOT NULL,
    permissions jsonb DEFAULT '{"coldEmailSend": "manual", "replyNegative": "auto_stop", "replyPositive": "manual", "sequencePause": "ask", "warmIntroSend": "manual", "newProspectAdd": "manual", "replyObjection": "manual", "strategySwitch": "ask", "linkedInActions": "draft_only"}'::jsonb NOT NULL,
    guardrails jsonb DEFAULT '{"language": "auto", "sendWindow": {"end": "18:00", "days": ["mon", "tue", "wed", "thu", "fri"], "start": "08:00", "timezone": "recipient"}, "neverContact": [], "maxDailySpend": 5, "maxEmailsPerDay": 40, "alwaysEscalateWhen": [], "maxEmailsPerProspect": 5, "maxNewProspectsPerWeek": 25, "maxEmailsPerProspectDays": 21}'::jsonb NOT NULL,
    brand jsonb DEFAULT '{"writingStyle": "Direct and concise", "forbiddenWords": [], "formalityLevel": "match_prospect", "signatureTemplate": ""}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_campaign_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_campaign_targets (
    id text NOT NULL,
    campaign_id text NOT NULL,
    tenant_id text NOT NULL,
    contact_id text NOT NULL,
    status public.call_target_status DEFAULT 'queued'::public.call_target_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_outcome public.call_outcome,
    last_attempt_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now(),
    listed_on text,
    added_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: call_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_campaigns (
    id text NOT NULL,
    tenant_id text NOT NULL,
    owner_id text,
    name text NOT NULL,
    status public.call_campaign_status DEFAULT 'active'::public.call_campaign_status NOT NULL,
    weekly_target integer DEFAULT 0 NOT NULL,
    days_per_week integer DEFAULT 5 NOT NULL,
    daily_quota integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 8 NOT NULL,
    window_days integer DEFAULT 15 NOT NULL,
    target_filter jsonb DEFAULT '{}'::jsonb,
    start_date timestamp with time zone DEFAULT now(),
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: call_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_lists (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    campaign_id text NOT NULL,
    owner_id text,
    name text NOT NULL,
    kind text DEFAULT 'sector'::text NOT NULL,
    segment jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort text DEFAULT 'fit'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: call_scripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_scripts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    sector text DEFAULT ''::text NOT NULL,
    opener text NOT NULL,
    problems jsonb DEFAULT '[]'::jsonb NOT NULL,
    permission_check text NOT NULL,
    booking_ask text NOT NULL,
    guidance jsonb DEFAULT '[]'::jsonb NOT NULL,
    origin text DEFAULT 'edited'::text NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id text NOT NULL,
    tenant_id text NOT NULL,
    contact_id text NOT NULL,
    user_id text NOT NULL,
    deal_id text,
    enrollment_id text,
    twilio_call_sid text,
    from_number text NOT NULL,
    to_number text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    connected_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_sec integer,
    talk_time_sec integer,
    outcome public.call_outcome,
    sentiment public.sentiment,
    recording_url text,
    recording_duration_sec integer,
    transcript jsonb DEFAULT '[]'::jsonb,
    summary text,
    buying_signals jsonb DEFAULT '{}'::jsonb,
    action_items jsonb DEFAULT '[]'::jsonb,
    voicemail_dropped boolean DEFAULT false,
    voicemail_template_id text,
    recording_consent text DEFAULT 'n_a'::text,
    two_party_consent_region boolean DEFAULT false,
    answered_by text,
    coaching_cards jsonb DEFAULT '[]'::jsonb,
    processing_state text DEFAULT 'pending'::text,
    processing_error text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    script_context jsonb,
    lever_scores jsonb
);


--
-- Name: capture_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capture_approvals (
    id text NOT NULL,
    tenant_id text NOT NULL,
    kind text NOT NULL,
    source_ref text,
    proposed_activity jsonb NOT NULL,
    summary text,
    status text DEFAULT 'pending'::text NOT NULL,
    applied_activity_id text,
    reviewed_by_user_id text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_memories (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    category text DEFAULT 'learned_context'::text NOT NULL,
    key text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    scope text DEFAULT 'user'::text NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id text NOT NULL,
    thread_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    parent_message_id text,
    branch_id text DEFAULT 'main'::text NOT NULL
);


--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_threads (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    title text,
    context_type text,
    context_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: coaching_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaching_insights (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    activity_id text,
    insight_type text NOT NULL,
    category text NOT NULL,
    score real,
    summary text NOT NULL,
    detail text NOT NULL,
    suggestion text,
    acknowledged boolean DEFAULT false,
    applied boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: code_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_executions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    chat_thread_id text,
    code text NOT NULL,
    data_query text,
    mode text DEFAULT 'read'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    output jsonb,
    error text,
    execution_time_ms integer,
    iteration integer DEFAULT 1 NOT NULL,
    parent_execution_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id text NOT NULL,
    tenant_id text NOT NULL,
    author_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    parent_comment_id text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    domain text,
    industry text,
    size text,
    revenue text,
    description text,
    properties jsonb DEFAULT '{}'::jsonb,
    score real,
    score_reasons jsonb DEFAULT '[]'::jsonb,
    owner_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    excluded_reason text,
    excluded_at timestamp with time zone,
    priority_score real,
    priority_score_computed_at timestamp with time zone,
    resolved_logo_url text,
    resolved_logo_tier integer,
    logo_resolved_at timestamp with time zone,
    user_uploaded_logo_url text,
    last_enriched_at timestamp with time zone,
    source_system text
);


--
-- Name: company_icp_fit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_icp_fit (
    company_id text NOT NULL,
    icp_id text NOT NULL,
    tenant_id text NOT NULL,
    fit_score real DEFAULT 0 NOT NULL,
    matched_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    identity_fit real,
    signal_fit real,
    coverage real
);


--
-- Name: connected_mailboxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connected_mailboxes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    email_address text NOT NULL,
    display_name text,
    provider text NOT NULL,
    ee_account_id text NOT NULL,
    domain text NOT NULL,
    status public.mailbox_status DEFAULT 'warming_up'::public.mailbox_status,
    daily_limit integer DEFAULT 50 NOT NULL,
    sent_today integer DEFAULT 0 NOT NULL,
    sent_total integer DEFAULT 0 NOT NULL,
    bounce_count_7d integer DEFAULT 0 NOT NULL,
    reply_count_7d integer DEFAULT 0 NOT NULL,
    health_score integer DEFAULT 100 NOT NULL,
    warmup_started_at timestamp with time zone,
    warmup_daily_target integer DEFAULT 5,
    warmup_completed_at timestamp with time zone,
    send_window_start text DEFAULT '08:00'::text,
    send_window_end text DEFAULT '18:00'::text,
    send_days jsonb DEFAULT '["mon", "tue", "wed", "thu", "fri"]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    imap_host text,
    imap_port integer,
    smtp_host text,
    smtp_port integer,
    secret_encrypted text,
    imap_last_uid integer,
    caldav_url text,
    caldav_last_sync_at timestamp with time zone,
    user_id text
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text,
    email text,
    phone text,
    first_name text,
    last_name text,
    title text,
    linkedin_url text,
    properties jsonb DEFAULT '{}'::jsonb,
    score real,
    score_reasons jsonb DEFAULT '[]'::jsonb,
    owner_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    last_enriched_at timestamp with time zone,
    source_system text
);


--
-- Name: content_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_variants (
    id text NOT NULL,
    tenant_id text NOT NULL,
    playbook_id text NOT NULL,
    segment text,
    prompt_hash text NOT NULL,
    mutation_type text,
    is_baseline boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sent integer DEFAULT 0,
    opened integer DEFAULT 0,
    replied integer DEFAULT 0,
    positive_replied integer DEFAULT 0,
    meetings_booked integer DEFAULT 0,
    reply_rate real,
    positive_rate real,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: context_graph_communities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_graph_communities (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    summary text,
    node_ids jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: context_graph_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_graph_edges (
    id text NOT NULL,
    tenant_id text NOT NULL,
    source_node_id text NOT NULL,
    target_node_id text NOT NULL,
    relation_type text NOT NULL,
    fact text NOT NULL,
    confidence real DEFAULT 1,
    t_valid timestamp with time zone DEFAULT now(),
    t_invalid timestamp with time zone,
    t_created timestamp with time zone DEFAULT now(),
    t_expired timestamp with time zone,
    source_type text,
    source_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: context_graph_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_graph_nodes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    name text NOT NULL,
    summary text,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_records (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    object_type text NOT NULL,
    name text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_signals (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    plan jsonb NOT NULL,
    color_index integer,
    is_active boolean DEFAULT true NOT NULL,
    backfilled_at timestamp with time zone,
    created_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icp_id text
);


--
-- Name: custom_skill_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_skill_templates (
    id text NOT NULL,
    tenant_id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    trigger text,
    context_required jsonb,
    output_format text,
    guidelines text NOT NULL,
    examples jsonb,
    version integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scope text DEFAULT 'workspace'::text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb,
    constraints jsonb DEFAULT '[]'::jsonb,
    parameters jsonb DEFAULT '[]'::jsonb,
    forked_from_id text,
    use_count integer DEFAULT 0 NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: customer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_requests (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    kind text NOT NULL,
    verbatim text NOT NULL,
    source text NOT NULL,
    canonical_key text,
    tenant_arr_usd double precision,
    status text DEFAULT 'open'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_retention_policies (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    table_name text NOT NULL,
    retention_days integer NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    last_purged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text,
    contact_id text,
    owner_id text,
    name text NOT NULL,
    stage public.deal_stage DEFAULT 'lead'::public.deal_stage,
    value integer,
    currency text DEFAULT 'USD'::text,
    expected_close_date timestamp with time zone,
    properties jsonb DEFAULT '{}'::jsonb,
    score real,
    score_reasons jsonb DEFAULT '[]'::jsonb,
    summary text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    project_amount integer,
    platform_arr integer
);


--
-- Name: deals_legacy_properties; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.deals_legacy_properties AS
 SELECT id,
    tenant_id,
    properties,
    updated_at
   FROM public.deals
  WHERE ((properties IS NOT NULL) AND ((properties)::text <> '{}'::text) AND ((jsonb_typeof((properties -> 'budget'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'team_size'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'current_crm'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'competitors'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'point_solutions'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'stakeholders'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'next_step'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'timeline'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'why_now'::text)) <> ALL (ARRAY['object'::text, 'null'::text])) OR (jsonb_typeof((properties -> 'summary'::text)) <> ALL (ARRAY['object'::text, 'null'::text]))));


--
-- Name: distillation_samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distillation_samples (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    agent_id text NOT NULL,
    system_prompt text NOT NULL,
    user_input text NOT NULL,
    assistant_output text NOT NULL,
    tool_calls jsonb DEFAULT '[]'::jsonb NOT NULL,
    quality_source text NOT NULL,
    quality_score real NOT NULL,
    tenant_id text,
    trace_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: do_not_call_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.do_not_call_list (
    id text NOT NULL,
    tenant_id text,
    phone_number text NOT NULL,
    reason text NOT NULL,
    source text DEFAULT 'manual'::text,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_optouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_optouts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    email_address text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_ip text,
    requested_user_agent text
);


--
-- Name: embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embeddings (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now(),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(content, ''::text))) STORED
);


--
-- Name: enrollment_strategy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_strategy (
    id text NOT NULL,
    enrollment_id text NOT NULL,
    playbook_id text NOT NULL,
    variant_id text,
    selection_score real NOT NULL,
    selection_reason text NOT NULL,
    alternatives_considered jsonb DEFAULT '[]'::jsonb,
    warm_path_used boolean DEFAULT false,
    connector_contact_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: eval_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_cases (
    id text NOT NULL,
    dataset_id text NOT NULL,
    input text NOT NULL,
    expected_output text,
    context text,
    tags jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: eval_datasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_datasets (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: eval_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_results (
    id text NOT NULL,
    run_id text NOT NULL,
    case_id text NOT NULL,
    agent_output text,
    score real,
    pass boolean,
    grader_reasoning text,
    latency_ms integer,
    tool_calls_count integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: eval_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eval_runs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    surface_id text NOT NULL,
    prompt_id text NOT NULL,
    cases_total integer NOT NULL,
    cases_passed integer NOT NULL,
    cases_errored integer DEFAULT 0 NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_latency_ms integer NOT NULL,
    total_cost_usd double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: failed_signin_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.failed_signin_attempts (
    id text NOT NULL,
    identifier_hash text NOT NULL,
    ip text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: icp_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icp_criteria (
    id text NOT NULL,
    icp_id text NOT NULL,
    field_key text NOT NULL,
    operator text NOT NULL,
    value jsonb,
    weight real DEFAULT 1 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: icp_field_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icp_field_catalog (
    id text NOT NULL,
    tenant_id text,
    field_key text NOT NULL,
    label text NOT NULL,
    source text NOT NULL,
    value_type text NOT NULL,
    operators jsonb DEFAULT '[]'::jsonb NOT NULL,
    apollo_param text,
    source_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: icps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icps (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_history (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    file_name text NOT NULL,
    record_type text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    created_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    companies_created integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inbound_visitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_visitors (
    id text NOT NULL,
    tenant_id text NOT NULL,
    session_id text NOT NULL,
    page_url text,
    referrer text,
    ip_address text,
    user_agent text,
    country text,
    identified_company_id text,
    identified_person_email text,
    identified_via text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    event_count integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: inbound_write_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_write_keys (
    id text NOT NULL,
    tenant_id text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone
);


--
-- Name: inbox_triage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_triage (
    id text NOT NULL,
    tenant_id text NOT NULL,
    conversation_key text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    done_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: intelligence_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intelligence_briefs (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    contact_id text,
    website_summary text,
    recent_news jsonb DEFAULT '[]'::jsonb,
    job_postings jsonb DEFAULT '[]'::jsonb,
    tech_stack jsonb DEFAULT '[]'::jsonb,
    linkedin_activity jsonb,
    public_content jsonb DEFAULT '[]'::jsonb,
    competitor_detected text,
    communication_style jsonb,
    pain_points jsonb DEFAULT '[]'::jsonb,
    best_angle text,
    warmth_signals jsonb DEFAULT '[]'::jsonb,
    public_content_depth integer DEFAULT 0,
    sources_attempted integer DEFAULT 0,
    sources_succeeded integer DEFAULT 0,
    source_errors jsonb DEFAULT '[]'::jsonb,
    researched_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: knowledge_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_entries (
    id text NOT NULL,
    tenant_id text NOT NULL,
    created_by text NOT NULL,
    scope text DEFAULT 'workspace'::text NOT NULL,
    title text NOT NULL,
    category text DEFAULT 'custom'::text NOT NULL,
    content text NOT NULL,
    content_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stages text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: llm_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_calls (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text,
    surface_id text NOT NULL,
    prompt_id text NOT NULL,
    model text NOT NULL,
    fallback_triggered boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    input_tokens integer,
    output_tokens integer,
    cost_usd double precision,
    latency_ms integer NOT NULL,
    outcome text NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_eval_case_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_eval_case_runs (
    id text NOT NULL,
    run_id text NOT NULL,
    case_id text NOT NULL,
    passed boolean NOT NULL,
    errored boolean DEFAULT false NOT NULL,
    latency_ms integer NOT NULL,
    error_message text,
    output_snippet text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_eval_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_eval_runs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    surface_id text NOT NULL,
    prompt_id text NOT NULL,
    cases_total integer NOT NULL,
    cases_passed integer NOT NULL,
    cases_errored integer DEFAULT 0 NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_latency_ms integer NOT NULL,
    total_cost_usd double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: llm_eval_runs_latest_with_failures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.llm_eval_runs_latest_with_failures AS
SELECT
    NULL::text AS run_id,
    NULL::text AS surface_id,
    NULL::text AS prompt_id,
    NULL::integer AS cases_total,
    NULL::integer AS cases_passed,
    NULL::integer AS cases_errored,
    NULL::integer AS cases_failed,
    NULL::jsonb AS metrics,
    NULL::integer AS total_latency_ms,
    NULL::timestamp with time zone AS created_at,
    NULL::bigint AS failed_case_count,
    NULL::bigint AS errored_case_count;


--
-- Name: meeting_opt_outs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_opt_outs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    activity_id text NOT NULL,
    attendee_email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    author_id text,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    title text,
    content text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: notetaker_exposures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notetaker_exposures (
    id text NOT NULL,
    activity_id text NOT NULL,
    referring_tenant_id text NOT NULL,
    participant_email text NOT NULL,
    participant_email_normalized text NOT NULL,
    exposure_at timestamp with time zone DEFAULT now() NOT NULL,
    branding_mode text NOT NULL,
    bot_display_name text NOT NULL,
    cta_clicked_at timestamp with time zone,
    signup_attributed_tenant_id text,
    signup_attributed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT notetaker_exposures_branding_mode_check CHECK ((branding_mode = ANY (ARRAY['full'::text, 'silent'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id text NOT NULL,
    user_id text NOT NULL,
    tenant_id text NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    type public.notification_type NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id text,
    read boolean DEFAULT false NOT NULL,
    email_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: onboarding_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_progress (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    current_phase integer DEFAULT 1 NOT NULL,
    completed_phases jsonb DEFAULT '[]'::jsonb NOT NULL,
    phase_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    checklist_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outbound_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbound_emails (
    id text NOT NULL,
    tenant_id text NOT NULL,
    campaign_id text,
    enrollment_id text,
    contact_id text,
    mailbox_id text,
    step_number integer,
    from_address text NOT NULL,
    to_address text NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    body_text text,
    message_id text,
    ee_message_id text,
    thread_id text,
    in_reply_to text,
    status public.outbound_status DEFAULT 'draft'::public.outbound_status,
    queued_at timestamp with time zone,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    replied_at timestamp with time zone,
    bounced_at timestamp with time zone,
    failed_at timestamp with time zone,
    reply_classification text,
    reply_snippet text,
    error_message text,
    bounce_type text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: outreach_playbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_playbooks (
    id text NOT NULL,
    tenant_id text NOT NULL,
    strategy_type text NOT NULL,
    is_active boolean DEFAULT true,
    custom_system_prompt text,
    activation_overrides jsonb,
    total_sent integer DEFAULT 0,
    total_replied integer DEFAULT 0,
    total_positive integer DEFAULT 0,
    avg_reply_rate real,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_ip text,
    requested_user_agent text
);


--
-- Name: pending_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_invites (
    id text NOT NULL,
    tenant_id text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    token text NOT NULL,
    invited_by_user_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sent_at timestamp with time zone DEFAULT now() NOT NULL,
    resend_count integer DEFAULT 0 NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: phone_number_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_number_pool (
    id text NOT NULL,
    tenant_id text NOT NULL,
    e164 text NOT NULL,
    twilio_sid text NOT NULL,
    country_code text NOT NULL,
    area_code text,
    voice boolean DEFAULT true,
    sms boolean DEFAULT false,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pipeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_events (
    id text NOT NULL,
    trace_id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text,
    contact_id text,
    deal_id text,
    enrollment_id text,
    outbound_email_id text,
    stage public.pipeline_stage NOT NULL,
    source_system text NOT NULL,
    duration_ms integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playbook_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playbook_entries (
    id text NOT NULL,
    tenant_id text NOT NULL,
    type text NOT NULL,
    content text NOT NULL,
    source_activity_id text,
    outcome_label text,
    perf_score real,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_experiment_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_experiment_metrics (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    experiment_id text NOT NULL,
    tenant_id text NOT NULL,
    variant text NOT NULL,
    metric text NOT NULL,
    value real NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_experiments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_experiments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    agent_id text NOT NULL,
    name text NOT NULL,
    description text,
    base_prompt_hash text NOT NULL,
    variant_delta text NOT NULL,
    traffic_percent integer DEFAULT 10 NOT NULL,
    status public.prompt_experiment_status DEFAULT 'active'::public.prompt_experiment_status NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    results jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposal_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_assets (
    id text NOT NULL,
    tenant_id text NOT NULL,
    content_type text NOT NULL,
    byte_size integer NOT NULL,
    bytes bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: proposal_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_components (
    id text NOT NULL,
    tenant_id text NOT NULL,
    proposal_id text NOT NULL,
    component_id text NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    placeholder_token text NOT NULL,
    data_key text,
    content text DEFAULT ''::text NOT NULL,
    source jsonb DEFAULT '{}'::jsonb,
    confidence text,
    "order" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: proposal_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_templates (
    id text NOT NULL,
    tenant_id text NOT NULL,
    created_by_user_id text,
    name text NOT NULL,
    source_format text NOT NULL,
    original_file_name text NOT NULL,
    storage_ref text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    extracted_text text,
    extracted_outline jsonb DEFAULT '[]'::jsonb,
    component_map jsonb,
    map_confirmed boolean DEFAULT false,
    detection_meta jsonb DEFAULT '{}'::jsonb,
    extraction_error text,
    mapped_by_user_id text,
    mapped_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id text NOT NULL,
    tenant_id text NOT NULL,
    template_id text NOT NULL,
    deal_id text,
    created_by_user_id text,
    status text DEFAULT 'filled'::text NOT NULL,
    output_storage_ref text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: referral_credit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_credit_events (
    id text NOT NULL,
    tenant_id text NOT NULL,
    event_type text NOT NULL,
    triggered_by_attribution_tenant_id text,
    triggered_by_exposure_id text,
    amount_cents integer DEFAULT 0 NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referral_credit_events_event_type_check CHECK ((event_type = ANY (ARRAY['attribution_earned'::text, 'credit_granted'::text, 'credit_consumed'::text])))
);


--
-- Name: saved_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_views (
    id text NOT NULL,
    user_id text NOT NULL,
    resource text NOT NULL,
    name text NOT NULL,
    filters jsonb NOT NULL,
    sort jsonb,
    columns jsonb,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sending_infra_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sending_infra_requests (
    id text NOT NULL,
    tenant_id text NOT NULL,
    requested_by_user_id text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assignee_email text,
    notes text,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sending_infra_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: sequence_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequence_drafts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    sequence_id text NOT NULL,
    step_id text NOT NULL,
    enrollment_id text NOT NULL,
    contact_id text NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    body_text text NOT NULL,
    trigger_reason text NOT NULL,
    personalization_sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public.sequence_draft_status DEFAULT 'pending_approval'::public.sequence_draft_status NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    review_reason text,
    scheduled_send_at timestamp with time zone,
    sent_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sequence_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequence_enrollments (
    id text NOT NULL,
    sequence_id text NOT NULL,
    contact_id text NOT NULL,
    status public.enrollment_status DEFAULT 'active'::public.enrollment_status,
    current_step integer DEFAULT 1,
    enrolled_at timestamp with time zone DEFAULT now(),
    last_step_at timestamp with time zone,
    next_step_at timestamp with time zone
);


--
-- Name: sequence_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequence_steps (
    id text NOT NULL,
    sequence_id text NOT NULL,
    step_number integer NOT NULL,
    subject_template text NOT NULL,
    body_template text NOT NULL,
    delay_days integer DEFAULT 2,
    created_at timestamp with time zone DEFAULT now(),
    step_type text DEFAULT 'email'::text NOT NULL,
    channel_config jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sequences (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    description text,
    status public.sequence_status DEFAULT 'draft'::public.sequence_status,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    campaign_config jsonb,
    deleted_at timestamp with time zone,
    icp_id text,
    created_by text
);


--
-- Name: shared_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_prompts (
    id text NOT NULL,
    tenant_id text NOT NULL,
    author_id text NOT NULL,
    title text NOT NULL,
    prompt text NOT NULL,
    scope text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: signal_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_outcomes (
    id text NOT NULL,
    tenant_id text NOT NULL,
    deal_id text NOT NULL,
    company_id text,
    signal_type text NOT NULL,
    signal_fired_at timestamp with time zone,
    outcome text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT signal_outcomes_outcome_check CHECK ((outcome = ANY (ARRAY['won'::text, 'lost'::text])))
);


--
-- Name: signal_url_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_url_cache (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    url text NOT NULL,
    status integer NOT NULL,
    outcome text NOT NULL,
    reason text NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    tenant_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text,
    stripe_price_id text,
    status public.subscription_status DEFAULT 'trialing'::public.subscription_status,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: system_trust_score; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_trust_score (
    tenant_id text NOT NULL,
    overall real DEFAULT 50 NOT NULL,
    per_playbook jsonb DEFAULT '{}'::jsonb,
    per_action jsonb DEFAULT '{}'::jsonb,
    actions_count integer DEFAULT 0,
    approvals_without_edit integer DEFAULT 0,
    rejections integer DEFAULT 0,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_downgrade_at timestamp with time zone,
    last_upgrade_at timestamp with time zone
);


--
-- Name: tam_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tam_proposals (
    id text NOT NULL,
    tenant_id text NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    dedup_key text,
    entity_type text,
    entity_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text,
    reason text,
    source text,
    score real,
    applied_entity_id text,
    reviewed_by_user_id text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    tenant_id text NOT NULL,
    assignee_id text,
    entity_type text,
    entity_id text,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    status text DEFAULT 'pending'::text,
    priority text DEFAULT 'medium'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id text NOT NULL,
    name text NOT NULL,
    plan text DEFAULT 'trial'::text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_approval_modes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tenant_approval_modes AS
 SELECT COALESCE((settings ->> 'approvalMode'::text), 'manual'::text) AS approval_mode,
    count(*) AS tenant_count,
    max(updated_at) AS last_change_at
   FROM public.tenants
  GROUP BY COALESCE((settings ->> 'approvalMode'::text), 'manual'::text);


--
-- Name: tenant_referral_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_referral_credits (
    tenant_id text NOT NULL,
    credits_earned_count integer DEFAULT 0 NOT NULL,
    credits_consumed_count integer DEFAULT 0 NOT NULL,
    last_credit_earned_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: tool_call_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_call_events (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    thread_id text,
    message_id text,
    tool_name text NOT NULL,
    args jsonb DEFAULT '{}'::jsonb,
    result jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'executed'::text NOT NULL,
    snapshot jsonb,
    reverse_op_id text,
    reverted_at timestamp with time zone,
    error_message text,
    surface_type text,
    executed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transcript_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcript_chunks (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    meeting_id text NOT NULL,
    speaker text,
    start_sec integer NOT NULL,
    end_sec integer NOT NULL,
    text text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    source text DEFAULT 'unknown'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trust_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_events (
    id text NOT NULL,
    tenant_id text NOT NULL,
    user_id text,
    event_type text NOT NULL,
    score_delta real DEFAULT 0 NOT NULL,
    new_score real NOT NULL,
    entity_ref text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_events (
    id text NOT NULL,
    tenant_id text NOT NULL,
    event_type public.usage_event_type NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_mfa_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_mfa_secrets (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    secret text NOT NULL,
    backup_codes text,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id text NOT NULL,
    user_id text NOT NULL,
    resource text NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    clerk_id text NOT NULL,
    tenant_id text NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    avatar_url text,
    role text DEFAULT 'member'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deactivated_at timestamp with time zone
);


--
-- Name: visitor_id_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_id_charges (
    id text NOT NULL,
    tenant_id text NOT NULL,
    visit_id text,
    provider text NOT NULL,
    cost_usd double precision,
    matched boolean DEFAULT false NOT NULL,
    response_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    charged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visitor_id_monthly_spend_by_tenant; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.visitor_id_monthly_spend_by_tenant AS
 SELECT tenant_id,
    provider,
    date_trunc('month'::text, (charged_at AT TIME ZONE 'UTC'::text)) AS month_utc,
    count(*) AS calls,
    count(*) FILTER (WHERE matched) AS matches,
    COALESCE(sum(cost_usd), (0)::double precision) AS cost_usd
   FROM public.visitor_id_charges
  GROUP BY tenant_id, provider, (date_trunc('month'::text, (charged_at AT TIME ZONE 'UTC'::text)));


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id text NOT NULL,
    visitor_id text NOT NULL,
    ip_hash text NOT NULL,
    url text NOT NULL,
    referrer text,
    utm jsonb DEFAULT '{}'::jsonb,
    user_agent text,
    company_domain text,
    company_id text,
    identified_at timestamp with time zone,
    identified_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subnet_hash text
);


--
-- Name: voice_usage_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_usage_monthly (
    id text NOT NULL,
    tenant_id text NOT NULL,
    year_month text NOT NULL,
    minutes_used integer DEFAULT 0 NOT NULL,
    calls_attempted integer DEFAULT 0 NOT NULL,
    calls_connected integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: voicemail_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voicemail_templates (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    audio_url text NOT NULL,
    duration_sec integer,
    language text DEFAULT 'fr'::text,
    variables jsonb DEFAULT '[]'::jsonb,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: warmup_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warmup_emails (
    id text NOT NULL,
    mailbox_id text NOT NULL,
    target_mailbox_id text NOT NULL,
    direction text NOT NULL,
    message_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    provider text NOT NULL,
    event_id text NOT NULL,
    tenant_id text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: __elevay_migrations __elevay_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.__elevay_migrations
    ADD CONSTRAINT __elevay_migrations_pkey PRIMARY KEY (filename);


--
-- Name: account_health_snapshots account_health_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_health_snapshots
    ADD CONSTRAINT account_health_snapshots_pkey PRIMARY KEY (id);


--
-- Name: account_suppressions account_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_suppressions
    ADD CONSTRAINT account_suppressions_pkey PRIMARY KEY (id);


--
-- Name: action_outcomes action_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_outcomes
    ADD CONSTRAINT action_outcomes_pkey PRIMARY KEY (id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: admin_alert_events admin_alert_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alert_events
    ADD CONSTRAINT admin_alert_events_pkey PRIMARY KEY (id);


--
-- Name: admin_alert_rules admin_alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alert_rules
    ADD CONSTRAINT admin_alert_rules_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_jwt_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_jwt_id_key UNIQUE (jwt_id);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- Name: ae_performance_snapshots ae_performance_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_performance_snapshots
    ADD CONSTRAINT ae_performance_snapshots_pkey PRIMARY KEY (id);


--
-- Name: agent_actions agent_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_actions
    ADD CONSTRAINT agent_actions_pkey PRIMARY KEY (id);


--
-- Name: agent_failure_patterns agent_failure_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_failure_patterns
    ADD CONSTRAINT agent_failure_patterns_pkey PRIMARY KEY (id);


--
-- Name: agent_few_shot_examples agent_few_shot_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_few_shot_examples
    ADD CONSTRAINT agent_few_shot_examples_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_versions agent_prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_versions
    ADD CONSTRAINT agent_prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: agent_reactions agent_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_reactions
    ADD CONSTRAINT agent_reactions_pkey PRIMARY KEY (id);


--
-- Name: agent_tasks agent_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);


--
-- Name: agent_traces agent_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_traces
    ADD CONSTRAINT agent_traces_pkey PRIMARY KEY (id);


--
-- Name: agent_work_items agent_work_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_pkey PRIMARY KEY (id);


--
-- Name: anonymized_signal_benchmarks anonymized_signal_benchmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymized_signal_benchmarks
    ADD CONSTRAINT anonymized_signal_benchmarks_pkey PRIMARY KEY (id);


--
-- Name: auth_account auth_account_provider_providerAccountId_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT "auth_account_provider_providerAccountId_pk" PRIMARY KEY (provider, "providerAccountId");


--
-- Name: auth_session auth_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_pkey PRIMARY KEY ("sessionToken");


--
-- Name: auth_user auth_user_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_email_unique UNIQUE (email);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: auth_verificationToken auth_verificationToken_identifier_token_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."auth_verificationToken"
    ADD CONSTRAINT "auth_verificationToken_identifier_token_pk" PRIMARY KEY (identifier, token);


--
-- Name: autonomy_config autonomy_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomy_config
    ADD CONSTRAINT autonomy_config_pkey PRIMARY KEY (tenant_id);


--
-- Name: call_campaign_targets call_campaign_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaign_targets
    ADD CONSTRAINT call_campaign_targets_pkey PRIMARY KEY (id);


--
-- Name: call_campaigns call_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaigns
    ADD CONSTRAINT call_campaigns_pkey PRIMARY KEY (id);


--
-- Name: call_lists call_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_lists
    ADD CONSTRAINT call_lists_pkey PRIMARY KEY (id);


--
-- Name: call_scripts call_scripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_scripts
    ADD CONSTRAINT call_scripts_pkey PRIMARY KEY (id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: capture_approvals capture_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_approvals
    ADD CONSTRAINT capture_approvals_pkey PRIMARY KEY (id);


--
-- Name: chat_memories chat_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_memories
    ADD CONSTRAINT chat_memories_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: coaching_insights coaching_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_insights
    ADD CONSTRAINT coaching_insights_pkey PRIMARY KEY (id);


--
-- Name: code_executions code_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_executions
    ADD CONSTRAINT code_executions_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_icp_fit company_icp_fit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_icp_fit
    ADD CONSTRAINT company_icp_fit_pkey PRIMARY KEY (company_id, icp_id);


--
-- Name: connected_mailboxes connected_mailboxes_ee_account_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_mailboxes
    ADD CONSTRAINT connected_mailboxes_ee_account_id_unique UNIQUE (ee_account_id);


--
-- Name: connected_mailboxes connected_mailboxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_mailboxes
    ADD CONSTRAINT connected_mailboxes_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: content_variants content_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variants
    ADD CONSTRAINT content_variants_pkey PRIMARY KEY (id);


--
-- Name: context_graph_communities context_graph_communities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_communities
    ADD CONSTRAINT context_graph_communities_pkey PRIMARY KEY (id);


--
-- Name: context_graph_edges context_graph_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_edges
    ADD CONSTRAINT context_graph_edges_pkey PRIMARY KEY (id);


--
-- Name: context_graph_nodes context_graph_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_nodes
    ADD CONSTRAINT context_graph_nodes_pkey PRIMARY KEY (id);


--
-- Name: custom_records custom_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_records
    ADD CONSTRAINT custom_records_pkey PRIMARY KEY (id);


--
-- Name: custom_signals custom_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_signals
    ADD CONSTRAINT custom_signals_pkey PRIMARY KEY (id);


--
-- Name: custom_skill_templates custom_skill_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_skill_templates
    ADD CONSTRAINT custom_skill_templates_pkey PRIMARY KEY (id);


--
-- Name: customer_requests customer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_requests
    ADD CONSTRAINT customer_requests_pkey PRIMARY KEY (id);


--
-- Name: data_retention_policies data_retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT data_retention_policies_pkey PRIMARY KEY (id);


--
-- Name: data_retention_policies data_retention_policies_table_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT data_retention_policies_table_name_key UNIQUE (table_name);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: distillation_samples distillation_samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distillation_samples
    ADD CONSTRAINT distillation_samples_pkey PRIMARY KEY (id);


--
-- Name: do_not_call_list do_not_call_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.do_not_call_list
    ADD CONSTRAINT do_not_call_list_pkey PRIMARY KEY (id);


--
-- Name: email_optouts email_optouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_optouts
    ADD CONSTRAINT email_optouts_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: embeddings embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_pkey PRIMARY KEY (id);


--
-- Name: embeddings embeddings_tenant_entity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT embeddings_tenant_entity_unique UNIQUE (tenant_id, entity_type, entity_id);


--
-- Name: enrollment_strategy enrollment_strategy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_strategy
    ADD CONSTRAINT enrollment_strategy_pkey PRIMARY KEY (id);


--
-- Name: llm_eval_case_runs eval_case_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_eval_case_runs
    ADD CONSTRAINT eval_case_runs_pkey PRIMARY KEY (id);


--
-- Name: eval_cases eval_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_cases
    ADD CONSTRAINT eval_cases_pkey PRIMARY KEY (id);


--
-- Name: eval_datasets eval_datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_datasets
    ADD CONSTRAINT eval_datasets_pkey PRIMARY KEY (id);


--
-- Name: eval_results eval_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_results
    ADD CONSTRAINT eval_results_pkey PRIMARY KEY (id);


--
-- Name: eval_runs eval_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_runs
    ADD CONSTRAINT eval_runs_pkey PRIMARY KEY (id);


--
-- Name: failed_signin_attempts failed_signin_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_signin_attempts
    ADD CONSTRAINT failed_signin_attempts_pkey PRIMARY KEY (id);


--
-- Name: icp_criteria icp_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icp_criteria
    ADD CONSTRAINT icp_criteria_pkey PRIMARY KEY (id);


--
-- Name: icp_field_catalog icp_field_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icp_field_catalog
    ADD CONSTRAINT icp_field_catalog_pkey PRIMARY KEY (id);


--
-- Name: icps icps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icps
    ADD CONSTRAINT icps_pkey PRIMARY KEY (id);


--
-- Name: import_history import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_pkey PRIMARY KEY (id);


--
-- Name: inbound_visitors inbound_visitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_visitors
    ADD CONSTRAINT inbound_visitors_pkey PRIMARY KEY (id);


--
-- Name: inbound_write_keys inbound_write_keys_key_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_write_keys
    ADD CONSTRAINT inbound_write_keys_key_hash_unique UNIQUE (key_hash);


--
-- Name: inbound_write_keys inbound_write_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_write_keys
    ADD CONSTRAINT inbound_write_keys_pkey PRIMARY KEY (id);


--
-- Name: inbox_triage inbox_triage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_triage
    ADD CONSTRAINT inbox_triage_pkey PRIMARY KEY (id);


--
-- Name: intelligence_briefs intelligence_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_briefs
    ADD CONSTRAINT intelligence_briefs_pkey PRIMARY KEY (id);


--
-- Name: knowledge_entries knowledge_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_entries
    ADD CONSTRAINT knowledge_entries_pkey PRIMARY KEY (id);


--
-- Name: llm_calls llm_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_calls
    ADD CONSTRAINT llm_calls_pkey PRIMARY KEY (id);


--
-- Name: llm_eval_runs llm_eval_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_eval_runs
    ADD CONSTRAINT llm_eval_runs_pkey PRIMARY KEY (id);


--
-- Name: meeting_opt_outs meeting_opt_outs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_opt_outs
    ADD CONSTRAINT meeting_opt_outs_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: notetaker_exposures notetaker_exposures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_exposures
    ADD CONSTRAINT notetaker_exposures_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onboarding_progress onboarding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_pkey PRIMARY KEY (id);


--
-- Name: outbound_emails outbound_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_emails
    ADD CONSTRAINT outbound_emails_pkey PRIMARY KEY (id);


--
-- Name: outreach_playbooks outreach_playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_playbooks
    ADD CONSTRAINT outreach_playbooks_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pending_invites pending_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_pkey PRIMARY KEY (id);


--
-- Name: pending_invites pending_invites_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_token_unique UNIQUE (token);


--
-- Name: phone_number_pool phone_number_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_number_pool
    ADD CONSTRAINT phone_number_pool_pkey PRIMARY KEY (id);


--
-- Name: pipeline_events pipeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_events
    ADD CONSTRAINT pipeline_events_pkey PRIMARY KEY (id);


--
-- Name: playbook_entries playbook_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playbook_entries
    ADD CONSTRAINT playbook_entries_pkey PRIMARY KEY (id);


--
-- Name: prompt_experiment_metrics prompt_experiment_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_experiment_metrics
    ADD CONSTRAINT prompt_experiment_metrics_pkey PRIMARY KEY (id);


--
-- Name: prompt_experiments prompt_experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_experiments
    ADD CONSTRAINT prompt_experiments_pkey PRIMARY KEY (id);


--
-- Name: proposal_assets proposal_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_assets
    ADD CONSTRAINT proposal_assets_pkey PRIMARY KEY (id);


--
-- Name: proposal_components proposal_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_components
    ADD CONSTRAINT proposal_components_pkey PRIMARY KEY (id);


--
-- Name: proposal_templates proposal_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_templates
    ADD CONSTRAINT proposal_templates_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: referral_credit_events referral_credit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_credit_events
    ADD CONSTRAINT referral_credit_events_pkey PRIMARY KEY (id);


--
-- Name: saved_views saved_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_pkey PRIMARY KEY (id);


--
-- Name: sending_infra_requests sending_infra_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sending_infra_requests
    ADD CONSTRAINT sending_infra_requests_pkey PRIMARY KEY (id);


--
-- Name: sequence_drafts sequence_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_drafts
    ADD CONSTRAINT sequence_drafts_pkey PRIMARY KEY (id);


--
-- Name: sequence_enrollments sequence_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_enrollments
    ADD CONSTRAINT sequence_enrollments_pkey PRIMARY KEY (id);


--
-- Name: sequence_steps sequence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_pkey PRIMARY KEY (id);


--
-- Name: sequences sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_pkey PRIMARY KEY (id);


--
-- Name: shared_prompts shared_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_prompts
    ADD CONSTRAINT shared_prompts_pkey PRIMARY KEY (id);


--
-- Name: signal_outcomes signal_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_outcomes
    ADD CONSTRAINT signal_outcomes_pkey PRIMARY KEY (id);


--
-- Name: signal_url_cache signal_url_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_url_cache
    ADD CONSTRAINT signal_url_cache_pkey PRIMARY KEY (id);


--
-- Name: signal_url_cache signal_url_cache_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_url_cache
    ADD CONSTRAINT signal_url_cache_url_key UNIQUE (url);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: system_trust_score system_trust_score_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_trust_score
    ADD CONSTRAINT system_trust_score_pkey PRIMARY KEY (tenant_id);


--
-- Name: tam_proposals tam_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tam_proposals
    ADD CONSTRAINT tam_proposals_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tenant_referral_credits tenant_referral_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_referral_credits
    ADD CONSTRAINT tenant_referral_credits_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tool_call_events tool_call_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_events
    ADD CONSTRAINT tool_call_events_pkey PRIMARY KEY (id);


--
-- Name: transcript_chunks transcript_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcript_chunks
    ADD CONSTRAINT transcript_chunks_pkey PRIMARY KEY (id);


--
-- Name: trust_events trust_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_events
    ADD CONSTRAINT trust_events_pkey PRIMARY KEY (id);


--
-- Name: usage_events usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);


--
-- Name: user_mfa_secrets user_mfa_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_secrets
    ADD CONSTRAINT user_mfa_secrets_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visitor_id_charges visitor_id_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_id_charges
    ADD CONSTRAINT visitor_id_charges_pkey PRIMARY KEY (id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: voice_usage_monthly voice_usage_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_usage_monthly
    ADD CONSTRAINT voice_usage_monthly_pkey PRIMARY KEY (id);


--
-- Name: voicemail_templates voicemail_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voicemail_templates
    ADD CONSTRAINT voicemail_templates_pkey PRIMARY KEY (id);


--
-- Name: warmup_emails warmup_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_emails
    ADD CONSTRAINT warmup_emails_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (provider, event_id);


--
-- Name: account_health_account_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_health_account_day_idx ON public.account_health_snapshots USING btree (account_id, computed_at);


--
-- Name: account_health_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_health_account_idx ON public.account_health_snapshots USING btree (account_id);


--
-- Name: account_health_computed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_health_computed_at_idx ON public.account_health_snapshots USING btree (computed_at);


--
-- Name: account_health_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_health_tenant_idx ON public.account_health_snapshots USING btree (tenant_id);


--
-- Name: account_suppressions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_company_idx ON public.account_suppressions USING btree (company_id);


--
-- Name: account_suppressions_tenant_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_tenant_domain_idx ON public.account_suppressions USING btree (tenant_id, domain);


--
-- Name: account_suppressions_tenant_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_tenant_email_idx ON public.account_suppressions USING btree (tenant_id, email);


--
-- Name: account_suppressions_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_tenant_idx ON public.account_suppressions USING btree (tenant_id);


--
-- Name: account_suppressions_tenant_linkedin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_tenant_linkedin_idx ON public.account_suppressions USING btree (tenant_id, linkedin);


--
-- Name: account_suppressions_tenant_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_tenant_name_idx ON public.account_suppressions USING btree (tenant_id, name_normalized);


--
-- Name: account_suppressions_tenant_native_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_suppressions_tenant_native_idx ON public.account_suppressions USING btree (tenant_id, native_id);


--
-- Name: action_outcomes_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_outcomes_action_idx ON public.action_outcomes USING btree (action_id);


--
-- Name: action_outcomes_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_outcomes_entity_idx ON public.action_outcomes USING btree (tenant_id, entity_type, entity_id);


--
-- Name: action_outcomes_stats_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_outcomes_stats_idx ON public.action_outcomes USING btree (tenant_id, action_type, status);


--
-- Name: action_outcomes_watching_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_outcomes_watching_idx ON public.action_outcomes USING btree (tenant_id, status, window_expires_at);


--
-- Name: activities_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_entity_idx ON public.activities USING btree (entity_type, entity_id);


--
-- Name: activities_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_occurred_at_idx ON public.activities USING btree (occurred_at);


--
-- Name: activities_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_tenant_id_idx ON public.activities USING btree (tenant_id);


--
-- Name: activities_thread_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_thread_id_idx ON public.activities USING btree (thread_id);


--
-- Name: activities_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activities_type_idx ON public.activities USING btree (activity_type);


--
-- Name: admin_alert_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_alert_events_created_idx ON public.admin_alert_events USING btree (created_at);


--
-- Name: admin_alert_events_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_alert_events_rule_idx ON public.admin_alert_events USING btree (rule_id);


--
-- Name: admin_alert_rules_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_alert_rules_agent_idx ON public.admin_alert_rules USING btree (agent_id);


--
-- Name: admin_audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_log_action_idx ON public.admin_audit_log USING btree (action);


--
-- Name: admin_audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log USING btree (created_at);


--
-- Name: admin_audit_log_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_log_resource_idx ON public.admin_audit_log USING btree (resource, resource_id);


--
-- Name: admin_audit_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_log_user_idx ON public.admin_audit_log USING btree (user_id);


--
-- Name: admin_sessions_jwt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_sessions_jwt_idx ON public.admin_sessions USING btree (jwt_id);


--
-- Name: admin_sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_sessions_user_idx ON public.admin_sessions USING btree (user_id);


--
-- Name: ae_perf_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ae_perf_period_idx ON public.ae_performance_snapshots USING btree (period_start, period_end);


--
-- Name: ae_perf_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ae_perf_tenant_user_idx ON public.ae_performance_snapshots USING btree (tenant_id, user_id);


--
-- Name: afp_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX afp_agent_idx ON public.agent_failure_patterns USING btree (agent_id);


--
-- Name: afp_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX afp_type_idx ON public.agent_failure_patterns USING btree (agent_id, pattern_type);


--
-- Name: afse_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX afse_agent_idx ON public.agent_few_shot_examples USING btree (agent_id);


--
-- Name: afse_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX afse_score_idx ON public.agent_few_shot_examples USING btree (agent_id, eval_score);


--
-- Name: agent_actions_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_actions_scheduled_idx ON public.agent_actions USING btree (scheduled_execution_at) WHERE (status = 'scheduled'::text);


--
-- Name: agent_actions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_actions_status_idx ON public.agent_actions USING btree (status);


--
-- Name: agent_actions_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_actions_tenant_created_idx ON public.agent_actions USING btree (tenant_id, created_at DESC);


--
-- Name: agent_reactions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_reactions_created_idx ON public.agent_reactions USING btree (tenant_id, created_at);


--
-- Name: agent_reactions_dedup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_reactions_dedup_idx ON public.agent_reactions USING btree (tenant_id, deduplication_key);


--
-- Name: agent_reactions_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_reactions_entity_idx ON public.agent_reactions USING btree (tenant_id, entity_type, entity_id);


--
-- Name: agent_tasks_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_tasks_tenant_status_idx ON public.agent_tasks USING btree (tenant_id, status);


--
-- Name: agent_tasks_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_tasks_thread_idx ON public.agent_tasks USING btree (chat_thread_id);


--
-- Name: agent_tasks_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_tasks_user_active_idx ON public.agent_tasks USING btree (user_id, status);


--
-- Name: agent_work_items_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_work_items_entity_idx ON public.agent_work_items USING btree (tenant_id, entity_type, entity_id);


--
-- Name: agent_work_items_next_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_work_items_next_action_idx ON public.agent_work_items USING btree (tenant_id, next_action_at);


--
-- Name: agent_work_items_tenant_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_work_items_tenant_priority_idx ON public.agent_work_items USING btree (tenant_id, priority);


--
-- Name: apv_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX apv_active_idx ON public.agent_prompt_versions USING btree (agent_id, is_active);


--
-- Name: apv_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX apv_agent_idx ON public.agent_prompt_versions USING btree (agent_id);


--
-- Name: asb_bucket_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX asb_bucket_key_idx ON public.anonymized_signal_benchmarks USING btree (industry, company_size, signal_type);


--
-- Name: asb_industry_size_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asb_industry_size_idx ON public.anonymized_signal_benchmarks USING btree (industry, company_size);


--
-- Name: asb_signal_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asb_signal_type_idx ON public.anonymized_signal_benchmarks USING btree (signal_type);


--
-- Name: at_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX at_agent_idx ON public.agent_traces USING btree (agent_id);


--
-- Name: at_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX at_created_idx ON public.agent_traces USING btree (created_at);


--
-- Name: at_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX at_status_idx ON public.agent_traces USING btree (status);


--
-- Name: at_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX at_tenant_idx ON public.agent_traces USING btree (tenant_id);


--
-- Name: at_trace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX at_trace_idx ON public.agent_traces USING btree (trace_id);


--
-- Name: call_campaign_targets_tenant_contact_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX call_campaign_targets_tenant_contact_active_uniq ON public.call_campaign_targets USING btree (tenant_id, contact_id) WHERE (status = ANY (ARRAY['queued'::public.call_target_status, 'in_progress'::public.call_target_status]));


--
-- Name: call_campaigns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_campaigns_status_idx ON public.call_campaigns USING btree (tenant_id, status);


--
-- Name: call_campaigns_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_campaigns_tenant_idx ON public.call_campaigns USING btree (tenant_id);


--
-- Name: call_lists_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_lists_owner_idx ON public.call_lists USING btree (tenant_id, owner_id);


--
-- Name: call_lists_tenant_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_lists_tenant_campaign_idx ON public.call_lists USING btree (tenant_id, campaign_id);


--
-- Name: call_scripts_tenant_sector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX call_scripts_tenant_sector_idx ON public.call_scripts USING btree (tenant_id, sector);


--
-- Name: call_target_campaign_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX call_target_campaign_contact_idx ON public.call_campaign_targets USING btree (campaign_id, contact_id);


--
-- Name: call_target_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_target_campaign_idx ON public.call_campaign_targets USING btree (campaign_id, status);


--
-- Name: call_target_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_target_due_idx ON public.call_campaign_targets USING btree (tenant_id, status, next_attempt_at);


--
-- Name: calls_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_contact_idx ON public.calls USING btree (contact_id);


--
-- Name: calls_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_outcome_idx ON public.calls USING btree (tenant_id, outcome);


--
-- Name: calls_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_started_idx ON public.calls USING btree (started_at);


--
-- Name: calls_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calls_tenant_idx ON public.calls USING btree (tenant_id);


--
-- Name: calls_twilio_sid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calls_twilio_sid_idx ON public.calls USING btree (twilio_call_sid);


--
-- Name: capture_approvals_dedup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX capture_approvals_dedup_idx ON public.capture_approvals USING btree (tenant_id, kind, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: capture_approvals_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_approvals_tenant_status_idx ON public.capture_approvals USING btree (tenant_id, status);


--
-- Name: cgc_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cgc_tenant_idx ON public.context_graph_communities USING btree (tenant_id);


--
-- Name: cge_relation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cge_relation_idx ON public.context_graph_edges USING btree (tenant_id, relation_type);


--
-- Name: cge_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cge_source_idx ON public.context_graph_edges USING btree (source_node_id);


--
-- Name: cge_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cge_target_idx ON public.context_graph_edges USING btree (target_node_id);


--
-- Name: cge_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cge_tenant_idx ON public.context_graph_edges USING btree (tenant_id);


--
-- Name: cge_valid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cge_valid_idx ON public.context_graph_edges USING btree (tenant_id, t_valid, t_invalid);


--
-- Name: cgn_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cgn_entity_idx ON public.context_graph_nodes USING btree (tenant_id, entity_type, entity_id);


--
-- Name: cgn_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cgn_name_idx ON public.context_graph_nodes USING btree (tenant_id, name);


--
-- Name: cgn_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cgn_tenant_idx ON public.context_graph_nodes USING btree (tenant_id);


--
-- Name: chat_memories_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_memories_category_idx ON public.chat_memories USING btree (category);


--
-- Name: chat_memories_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_memories_scope_idx ON public.chat_memories USING btree (tenant_id, scope);


--
-- Name: chat_memories_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_memories_tenant_user_idx ON public.chat_memories USING btree (tenant_id, user_id);


--
-- Name: chat_messages_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_branch_idx ON public.chat_messages USING btree (thread_id, branch_id);


--
-- Name: chat_messages_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_parent_idx ON public.chat_messages USING btree (parent_message_id);


--
-- Name: chat_messages_thread_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_thread_id_idx ON public.chat_messages USING btree (thread_id);


--
-- Name: chat_threads_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_threads_tenant_id_idx ON public.chat_threads USING btree (tenant_id);


--
-- Name: chat_threads_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_threads_user_id_idx ON public.chat_threads USING btree (user_id);


--
-- Name: coaching_insights_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_insights_created_at_idx ON public.coaching_insights USING btree (created_at);


--
-- Name: coaching_insights_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_insights_entity_idx ON public.coaching_insights USING btree (entity_type, entity_id);


--
-- Name: coaching_insights_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_insights_tenant_idx ON public.coaching_insights USING btree (tenant_id);


--
-- Name: coaching_insights_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_insights_user_idx ON public.coaching_insights USING btree (user_id);


--
-- Name: code_executions_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX code_executions_tenant_idx ON public.code_executions USING btree (tenant_id);


--
-- Name: code_executions_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX code_executions_thread_idx ON public.code_executions USING btree (chat_thread_id);


--
-- Name: comments_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_author_idx ON public.comments USING btree (author_id);


--
-- Name: comments_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_parent_idx ON public.comments USING btree (parent_comment_id);


--
-- Name: comments_tenant_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_tenant_entity_idx ON public.comments USING btree (tenant_id, entity_type, entity_id);


--
-- Name: companies_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_domain_idx ON public.companies USING btree (domain);


--
-- Name: companies_excluded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_excluded_at_idx ON public.companies USING btree (excluded_at);


--
-- Name: companies_logo_resolved_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_logo_resolved_at_idx ON public.companies USING btree (logo_resolved_at);


--
-- Name: companies_priority_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_priority_score_idx ON public.companies USING btree (tenant_id, priority_score);


--
-- Name: companies_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_tenant_id_idx ON public.companies USING btree (tenant_id);


--
-- Name: companies_tenant_last_enriched_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_tenant_last_enriched_idx ON public.companies USING btree (tenant_id, last_enriched_at);


--
-- Name: company_icp_fit_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_icp_fit_company_idx ON public.company_icp_fit USING btree (company_id);


--
-- Name: company_icp_fit_icp_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_icp_fit_icp_score_idx ON public.company_icp_fit USING btree (icp_id, fit_score);


--
-- Name: company_icp_fit_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_icp_fit_tenant_idx ON public.company_icp_fit USING btree (tenant_id);


--
-- Name: contacts_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_company_id_idx ON public.contacts USING btree (company_id);


--
-- Name: contacts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_email_idx ON public.contacts USING btree (email);


--
-- Name: contacts_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_tenant_id_idx ON public.contacts USING btree (tenant_id);


--
-- Name: contacts_tenant_last_enriched_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_tenant_last_enriched_idx ON public.contacts USING btree (tenant_id, last_enriched_at);


--
-- Name: content_variants_playbook_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_variants_playbook_idx ON public.content_variants USING btree (playbook_id, is_active);


--
-- Name: content_variants_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_variants_tenant_idx ON public.content_variants USING btree (tenant_id);


--
-- Name: custom_records_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_records_tenant_id_idx ON public.custom_records USING btree (tenant_id, id);


--
-- Name: custom_records_tenant_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_records_tenant_type_idx ON public.custom_records USING btree (tenant_id, object_type);


--
-- Name: custom_signals_icp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_signals_icp_idx ON public.custom_signals USING btree (icp_id);


--
-- Name: custom_signals_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_signals_tenant_idx ON public.custom_signals USING btree (tenant_id);


--
-- Name: custom_signals_tenant_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX custom_signals_tenant_name_idx ON public.custom_signals USING btree (tenant_id, name);


--
-- Name: custom_skill_templates_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_skill_templates_scope_idx ON public.custom_skill_templates USING btree (tenant_id, scope);


--
-- Name: custom_skill_templates_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_skill_templates_slug_idx ON public.custom_skill_templates USING btree (tenant_id, slug);


--
-- Name: custom_skill_templates_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_skill_templates_tenant_idx ON public.custom_skill_templates USING btree (tenant_id);


--
-- Name: customer_requests_canonical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_requests_canonical_idx ON public.customer_requests USING btree (canonical_key);


--
-- Name: customer_requests_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_requests_created_at_idx ON public.customer_requests USING btree (created_at);


--
-- Name: customer_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_requests_status_idx ON public.customer_requests USING btree (status);


--
-- Name: customer_requests_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_requests_tenant_idx ON public.customer_requests USING btree (tenant_id);


--
-- Name: deals_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_company_id_idx ON public.deals USING btree (company_id);


--
-- Name: deals_props_budget_manual_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_props_budget_manual_idx ON public.deals USING btree (tenant_id) WHERE (((properties -> 'budget'::text) ->> 'manual'::text) = 'false'::text);


--
-- Name: deals_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_stage_idx ON public.deals USING btree (stage);


--
-- Name: deals_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_tenant_id_idx ON public.deals USING btree (tenant_id);


--
-- Name: dnc_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dnc_phone_idx ON public.do_not_call_list USING btree (phone_number);


--
-- Name: dnc_phone_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dnc_phone_tenant_idx ON public.do_not_call_list USING btree (tenant_id, phone_number);


--
-- Name: ds_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_agent_idx ON public.distillation_samples USING btree (agent_id);


--
-- Name: ds_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_created_idx ON public.distillation_samples USING btree (created_at);


--
-- Name: ds_quality_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_quality_score_idx ON public.distillation_samples USING btree (quality_score);


--
-- Name: ds_quality_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ds_quality_source_idx ON public.distillation_samples USING btree (quality_source);


--
-- Name: ec_dataset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ec_dataset_idx ON public.eval_cases USING btree (dataset_id);


--
-- Name: ed_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ed_tenant_idx ON public.eval_datasets USING btree (tenant_id);


--
-- Name: email_verification_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_expires_at_idx ON public.email_verification_tokens USING btree (expires_at);


--
-- Name: email_verification_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_token_hash_idx ON public.email_verification_tokens USING btree (token_hash);


--
-- Name: email_verification_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_user_id_idx ON public.email_verification_tokens USING btree (user_id);


--
-- Name: embeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX embeddings_embedding_idx ON public.embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: embeddings_search_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX embeddings_search_vector_idx ON public.embeddings USING gin (search_vector);


--
-- Name: embeddings_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX embeddings_tenant_id_idx ON public.embeddings USING btree (tenant_id);


--
-- Name: enrollment_strategy_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX enrollment_strategy_enrollment_idx ON public.enrollment_strategy USING btree (enrollment_id);


--
-- Name: enrollments_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_contact_id_idx ON public.sequence_enrollments USING btree (contact_id);


--
-- Name: enrollments_next_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_next_step_idx ON public.sequence_enrollments USING btree (next_step_at);


--
-- Name: enrollments_sequence_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_sequence_id_idx ON public.sequence_enrollments USING btree (sequence_id);


--
-- Name: eres_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eres_case_idx ON public.eval_results USING btree (case_id);


--
-- Name: eres_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eres_run_idx ON public.eval_results USING btree (run_id);


--
-- Name: eval_runs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_runs_created_at_idx ON public.eval_runs USING btree (created_at);


--
-- Name: eval_runs_surface_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_runs_surface_idx ON public.eval_runs USING btree (surface_id);


--
-- Name: failed_signin_attempts_attempted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX failed_signin_attempts_attempted_at_idx ON public.failed_signin_attempts USING btree (attempted_at);


--
-- Name: failed_signin_attempts_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX failed_signin_attempts_identifier_idx ON public.failed_signin_attempts USING btree (identifier_hash);


--
-- Name: icp_criteria_field_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icp_criteria_field_idx ON public.icp_criteria USING btree (field_key);


--
-- Name: icp_criteria_icp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icp_criteria_icp_idx ON public.icp_criteria USING btree (icp_id);


--
-- Name: icp_field_catalog_global_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX icp_field_catalog_global_key_idx ON public.icp_field_catalog USING btree (field_key) WHERE (tenant_id IS NULL);


--
-- Name: icp_field_catalog_scope_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX icp_field_catalog_scope_key_idx ON public.icp_field_catalog USING btree (tenant_id, field_key);


--
-- Name: icp_field_catalog_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icp_field_catalog_tenant_idx ON public.icp_field_catalog USING btree (tenant_id);


--
-- Name: icps_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icps_tenant_idx ON public.icps USING btree (tenant_id);


--
-- Name: icps_tenant_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icps_tenant_priority_idx ON public.icps USING btree (tenant_id, priority);


--
-- Name: icps_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX icps_tenant_status_idx ON public.icps USING btree (tenant_id, status);


--
-- Name: idx_activities_body_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_body_fts ON public.activities USING gin (body_tsvector);


--
-- Name: idx_tasks_tenant_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_tenant_not_deleted ON public.tasks USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: import_history_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_history_created_idx ON public.import_history USING btree (created_at);


--
-- Name: import_history_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_history_tenant_idx ON public.import_history USING btree (tenant_id);


--
-- Name: inbound_visitors_identified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_visitors_identified_idx ON public.inbound_visitors USING btree (tenant_id, identified_company_id);


--
-- Name: inbound_visitors_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_visitors_last_seen_idx ON public.inbound_visitors USING btree (tenant_id, last_seen_at);


--
-- Name: inbound_visitors_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_visitors_session_idx ON public.inbound_visitors USING btree (tenant_id, session_id);


--
-- Name: inbound_visitors_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_visitors_tenant_idx ON public.inbound_visitors USING btree (tenant_id);


--
-- Name: inbound_write_keys_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_write_keys_tenant_idx ON public.inbound_write_keys USING btree (tenant_id);


--
-- Name: inbox_triage_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_triage_tenant_idx ON public.inbox_triage USING btree (tenant_id);


--
-- Name: inbox_triage_tenant_key_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inbox_triage_tenant_key_uq ON public.inbox_triage USING btree (tenant_id, conversation_key);


--
-- Name: intelligence_briefs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intelligence_briefs_company_idx ON public.intelligence_briefs USING btree (company_id);


--
-- Name: intelligence_briefs_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intelligence_briefs_expires_idx ON public.intelligence_briefs USING btree (expires_at);


--
-- Name: intelligence_briefs_tenant_company_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX intelligence_briefs_tenant_company_contact_idx ON public.intelligence_briefs USING btree (tenant_id, company_id, contact_id);


--
-- Name: intelligence_briefs_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intelligence_briefs_tenant_idx ON public.intelligence_briefs USING btree (tenant_id);


--
-- Name: knowledge_entries_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_entries_category_idx ON public.knowledge_entries USING btree (tenant_id, category);


--
-- Name: knowledge_entries_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_entries_scope_idx ON public.knowledge_entries USING btree (tenant_id, scope);


--
-- Name: knowledge_entries_stages_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_entries_stages_idx ON public.knowledge_entries USING gin (stages);


--
-- Name: knowledge_entries_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_entries_tenant_idx ON public.knowledge_entries USING btree (tenant_id);


--
-- Name: llm_calls_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_created_at_idx ON public.llm_calls USING btree (created_at);


--
-- Name: llm_calls_prompt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_prompt_idx ON public.llm_calls USING btree (prompt_id);


--
-- Name: llm_calls_surface_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_surface_idx ON public.llm_calls USING btree (surface_id);


--
-- Name: llm_calls_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_tenant_idx ON public.llm_calls USING btree (tenant_id);


--
-- Name: llm_eval_case_runs_case_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_eval_case_runs_case_idx ON public.llm_eval_case_runs USING btree (case_id);


--
-- Name: llm_eval_case_runs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_eval_case_runs_created_at_idx ON public.llm_eval_case_runs USING btree (created_at);


--
-- Name: llm_eval_case_runs_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_eval_case_runs_run_idx ON public.llm_eval_case_runs USING btree (run_id);


--
-- Name: llm_eval_runs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_eval_runs_created_at_idx ON public.llm_eval_runs USING btree (created_at);


--
-- Name: llm_eval_runs_surface_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_eval_runs_surface_idx ON public.llm_eval_runs USING btree (surface_id);


--
-- Name: mailbox_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mailbox_domain_idx ON public.connected_mailboxes USING btree (domain);


--
-- Name: mailbox_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mailbox_status_idx ON public.connected_mailboxes USING btree (status);


--
-- Name: mailbox_tenant_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mailbox_tenant_email_idx ON public.connected_mailboxes USING btree (tenant_id, email_address);


--
-- Name: mailbox_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mailbox_tenant_idx ON public.connected_mailboxes USING btree (tenant_id);


--
-- Name: mailbox_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mailbox_user_idx ON public.connected_mailboxes USING btree (user_id);


--
-- Name: moo_activity_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX moo_activity_email_idx ON public.meeting_opt_outs USING btree (activity_id, attendee_email);


--
-- Name: notes_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notes_entity_idx ON public.notes USING btree (entity_type, entity_id);


--
-- Name: notes_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notes_tenant_id_idx ON public.notes USING btree (tenant_id);


--
-- Name: notetaker_exposures_activity_email_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notetaker_exposures_activity_email_uniq ON public.notetaker_exposures USING btree (activity_id, participant_email_normalized);


--
-- Name: notetaker_exposures_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_exposures_activity_idx ON public.notetaker_exposures USING btree (activity_id);


--
-- Name: notetaker_exposures_email_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_exposures_email_at_idx ON public.notetaker_exposures USING btree (participant_email_normalized, exposure_at DESC);


--
-- Name: notetaker_exposures_referring_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notetaker_exposures_referring_at_idx ON public.notetaker_exposures USING btree (referring_tenant_id, exposure_at DESC);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);


--
-- Name: notifications_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_read_idx ON public.notifications USING btree (read);


--
-- Name: notifications_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_tenant_idx ON public.notifications USING btree (tenant_id);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id);


--
-- Name: onboarding_progress_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX onboarding_progress_tenant_idx ON public.onboarding_progress USING btree (tenant_id);


--
-- Name: optout_tenant_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX optout_tenant_email_idx ON public.email_optouts USING btree (tenant_id, email_address);


--
-- Name: outbound_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_contact_idx ON public.outbound_emails USING btree (contact_id);


--
-- Name: outbound_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_enrollment_idx ON public.outbound_emails USING btree (enrollment_id);


--
-- Name: outbound_mailbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_mailbox_idx ON public.outbound_emails USING btree (mailbox_id);


--
-- Name: outbound_sent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_sent_idx ON public.outbound_emails USING btree (sent_at);


--
-- Name: outbound_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_status_idx ON public.outbound_emails USING btree (status);


--
-- Name: outbound_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_tenant_idx ON public.outbound_emails USING btree (tenant_id);


--
-- Name: outbound_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_tenant_status_idx ON public.outbound_emails USING btree (tenant_id, status);


--
-- Name: outbound_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbound_thread_idx ON public.outbound_emails USING btree (thread_id);


--
-- Name: outreach_playbooks_tenant_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_playbooks_tenant_type_idx ON public.outreach_playbooks USING btree (tenant_id, strategy_type);


--
-- Name: password_reset_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: password_reset_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_token_hash_idx ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: password_reset_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);


--
-- Name: pe_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_agent_idx ON public.prompt_experiments USING btree (agent_id);


--
-- Name: pe_agent_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_agent_status_idx ON public.prompt_experiments USING btree (agent_id, status);


--
-- Name: pe_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_company_created_idx ON public.pipeline_events USING btree (company_id, created_at);


--
-- Name: pe_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_contact_idx ON public.pipeline_events USING btree (contact_id);


--
-- Name: pe_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_enrollment_idx ON public.pipeline_events USING btree (enrollment_id);


--
-- Name: pe_stage_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_stage_created_idx ON public.pipeline_events USING btree (stage, created_at);


--
-- Name: pe_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_status_idx ON public.prompt_experiments USING btree (status);


--
-- Name: pe_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_tenant_created_idx ON public.pipeline_events USING btree (tenant_id, created_at);


--
-- Name: pe_trace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pe_trace_idx ON public.pipeline_events USING btree (trace_id);


--
-- Name: pem_experiment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pem_experiment_idx ON public.prompt_experiment_metrics USING btree (experiment_id);


--
-- Name: pem_experiment_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pem_experiment_variant_idx ON public.prompt_experiment_metrics USING btree (experiment_id, variant);


--
-- Name: pending_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_invites_email_idx ON public.pending_invites USING btree (tenant_id, email);


--
-- Name: pending_invites_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_invites_tenant_status_idx ON public.pending_invites USING btree (tenant_id, status);


--
-- Name: playbook_entries_perf_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playbook_entries_perf_idx ON public.playbook_entries USING btree (tenant_id, perf_score);


--
-- Name: playbook_entries_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playbook_entries_source_idx ON public.playbook_entries USING btree (source_activity_id);


--
-- Name: playbook_entries_tenant_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playbook_entries_tenant_type_idx ON public.playbook_entries USING btree (tenant_id, type);


--
-- Name: pool_area_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pool_area_idx ON public.phone_number_pool USING btree (country_code, area_code);


--
-- Name: pool_e164_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pool_e164_idx ON public.phone_number_pool USING btree (e164);


--
-- Name: pool_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pool_tenant_idx ON public.phone_number_pool USING btree (tenant_id);


--
-- Name: proposal_assets_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposal_assets_tenant_id_idx ON public.proposal_assets USING btree (tenant_id);


--
-- Name: proposal_components_proposal_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposal_components_proposal_id_idx ON public.proposal_components USING btree (proposal_id);


--
-- Name: proposal_components_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposal_components_tenant_id_idx ON public.proposal_components USING btree (tenant_id);


--
-- Name: proposal_templates_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposal_templates_tenant_id_idx ON public.proposal_templates USING btree (tenant_id);


--
-- Name: proposal_templates_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposal_templates_tenant_status_idx ON public.proposal_templates USING btree (tenant_id, status);


--
-- Name: proposals_deal_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposals_deal_id_idx ON public.proposals USING btree (deal_id);


--
-- Name: proposals_template_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposals_template_id_idx ON public.proposals USING btree (template_id);


--
-- Name: proposals_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposals_tenant_id_idx ON public.proposals USING btree (tenant_id);


--
-- Name: referral_credit_events_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referral_credit_events_tenant_created_idx ON public.referral_credit_events USING btree (tenant_id, created_at DESC);


--
-- Name: saved_views_user_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_views_user_resource_idx ON public.saved_views USING btree (user_id, resource);


--
-- Name: sending_infra_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_infra_requests_status_idx ON public.sending_infra_requests USING btree (status);


--
-- Name: sending_infra_requests_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sending_infra_requests_tenant_idx ON public.sending_infra_requests USING btree (tenant_id);


--
-- Name: sequence_drafts_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequence_drafts_enrollment_idx ON public.sequence_drafts USING btree (enrollment_id);


--
-- Name: sequence_drafts_pending_age_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequence_drafts_pending_age_idx ON public.sequence_drafts USING btree (generated_at) WHERE (status = 'pending_approval'::public.sequence_draft_status);


--
-- Name: sequence_drafts_sequence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequence_drafts_sequence_idx ON public.sequence_drafts USING btree (sequence_id, generated_at DESC);


--
-- Name: sequence_drafts_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequence_drafts_tenant_status_idx ON public.sequence_drafts USING btree (tenant_id, status, generated_at DESC);


--
-- Name: sequence_steps_sequence_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequence_steps_sequence_id_idx ON public.sequence_steps USING btree (sequence_id);


--
-- Name: sequence_steps_step_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequence_steps_step_type_idx ON public.sequence_steps USING btree (sequence_id, step_type);


--
-- Name: sequences_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequences_created_by_idx ON public.sequences USING btree (created_by);


--
-- Name: sequences_icp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequences_icp_idx ON public.sequences USING btree (icp_id);


--
-- Name: sequences_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequences_status_idx ON public.sequences USING btree (status);


--
-- Name: sequences_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sequences_tenant_id_idx ON public.sequences USING btree (tenant_id);


--
-- Name: shared_prompts_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_prompts_author_idx ON public.shared_prompts USING btree (author_id);


--
-- Name: shared_prompts_tenant_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_prompts_tenant_scope_idx ON public.shared_prompts USING btree (tenant_id, scope);


--
-- Name: signal_outcomes_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_outcomes_deal_idx ON public.signal_outcomes USING btree (deal_id);


--
-- Name: signal_outcomes_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_outcomes_tenant_idx ON public.signal_outcomes USING btree (tenant_id);


--
-- Name: signal_outcomes_tenant_signal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_outcomes_tenant_signal_idx ON public.signal_outcomes USING btree (tenant_id, signal_type, outcome);


--
-- Name: signal_url_cache_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signal_url_cache_expires_idx ON public.signal_url_cache USING btree (expires_at);


--
-- Name: subscriptions_stripe_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_stripe_customer_idx ON public.subscriptions USING btree (stripe_customer_id);


--
-- Name: subscriptions_stripe_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_stripe_sub_idx ON public.subscriptions USING btree (stripe_subscription_id);


--
-- Name: subscriptions_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_tenant_id_idx ON public.subscriptions USING btree (tenant_id);


--
-- Name: tam_proposals_dedup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tam_proposals_dedup_idx ON public.tam_proposals USING btree (tenant_id, kind, dedup_key);


--
-- Name: tam_proposals_tenant_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tam_proposals_tenant_kind_status_idx ON public.tam_proposals USING btree (tenant_id, kind, status);


--
-- Name: tam_proposals_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tam_proposals_tenant_status_idx ON public.tam_proposals USING btree (tenant_id, status);


--
-- Name: tasks_assignee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_assignee_idx ON public.tasks USING btree (assignee_id);


--
-- Name: tasks_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_due_date_idx ON public.tasks USING btree (due_date);


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- Name: tasks_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_tenant_id_idx ON public.tasks USING btree (tenant_id);


--
-- Name: tool_call_events_executed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_events_executed_at_idx ON public.tool_call_events USING btree (executed_at);


--
-- Name: tool_call_events_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_events_tenant_user_idx ON public.tool_call_events USING btree (tenant_id, user_id);


--
-- Name: tool_call_events_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_events_thread_idx ON public.tool_call_events USING btree (thread_id);


--
-- Name: tool_call_events_tool_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_events_tool_name_idx ON public.tool_call_events USING btree (tool_name);


--
-- Name: transcript_chunks_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcript_chunks_embedding_idx ON public.transcript_chunks USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: transcript_chunks_meeting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcript_chunks_meeting_idx ON public.transcript_chunks USING btree (meeting_id);


--
-- Name: transcript_chunks_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcript_chunks_tenant_idx ON public.transcript_chunks USING btree (tenant_id);


--
-- Name: trust_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trust_events_event_type_idx ON public.trust_events USING btree (event_type);


--
-- Name: trust_events_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trust_events_tenant_created_idx ON public.trust_events USING btree (tenant_id, created_at DESC);


--
-- Name: usage_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_created_idx ON public.usage_events USING btree (created_at);


--
-- Name: usage_events_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_tenant_id_idx ON public.usage_events USING btree (tenant_id);


--
-- Name: usage_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_type_idx ON public.usage_events USING btree (event_type);


--
-- Name: user_mfa_secrets_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_mfa_secrets_user_idx ON public.user_mfa_secrets USING btree (user_id);


--
-- Name: user_preferences_user_resource_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_preferences_user_resource_key_idx ON public.user_preferences USING btree (user_id, resource, key);


--
-- Name: users_clerk_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_clerk_id_idx ON public.users USING btree (clerk_id);


--
-- Name: users_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_tenant_id_idx ON public.users USING btree (tenant_id);


--
-- Name: visitor_id_charges_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_id_charges_provider_idx ON public.visitor_id_charges USING btree (provider);


--
-- Name: visitor_id_charges_tenant_charged_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_id_charges_tenant_charged_at_idx ON public.visitor_id_charges USING btree (tenant_id, charged_at DESC);


--
-- Name: visits_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_company_idx ON public.visits USING btree (company_id);


--
-- Name: visits_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_created_at_idx ON public.visits USING btree (created_at);


--
-- Name: visits_subnet_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_subnet_hash_idx ON public.visits USING btree (tenant_id, subnet_hash) WHERE (subnet_hash IS NOT NULL);


--
-- Name: visits_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_tenant_idx ON public.visits USING btree (tenant_id);


--
-- Name: visits_visitor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_visitor_idx ON public.visits USING btree (visitor_id);


--
-- Name: vm_templates_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vm_templates_tenant_idx ON public.voicemail_templates USING btree (tenant_id);


--
-- Name: voice_usage_tenant_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX voice_usage_tenant_month_idx ON public.voice_usage_monthly USING btree (tenant_id, year_month);


--
-- Name: webhook_events_processed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_processed_at_idx ON public.webhook_events USING btree (processed_at);


--
-- Name: llm_eval_runs_latest_with_failures _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.llm_eval_runs_latest_with_failures AS
 SELECT ler.id AS run_id,
    ler.surface_id,
    ler.prompt_id,
    ler.cases_total,
    ler.cases_passed,
    ler.cases_errored,
    ((ler.cases_total - ler.cases_passed) - ler.cases_errored) AS cases_failed,
    ler.metrics,
    ler.total_latency_ms,
    ler.created_at,
    count(lecr.id) FILTER (WHERE ((NOT lecr.passed) AND (NOT lecr.errored))) AS failed_case_count,
    count(lecr.id) FILTER (WHERE lecr.errored) AS errored_case_count
   FROM (public.llm_eval_runs ler
     LEFT JOIN public.llm_eval_case_runs lecr ON ((lecr.run_id = ler.id)))
  GROUP BY ler.id;


--
-- Name: admin_audit_log no_delete_admin_audit; Type: RULE; Schema: public; Owner: -
--

CREATE RULE no_delete_admin_audit AS
    ON DELETE TO public.admin_audit_log DO INSTEAD NOTHING;


--
-- Name: admin_audit_log no_update_admin_audit; Type: RULE; Schema: public; Owner: -
--

CREATE RULE no_update_admin_audit AS
    ON UPDATE TO public.admin_audit_log DO INSTEAD NOTHING;


--
-- Name: account_suppressions account_suppressions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_suppressions
    ADD CONSTRAINT account_suppressions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: action_outcomes action_outcomes_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_outcomes
    ADD CONSTRAINT action_outcomes_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: activities activities_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: admin_alert_events admin_alert_events_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alert_events
    ADD CONSTRAINT admin_alert_events_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.admin_alert_rules(id);


--
-- Name: admin_sessions admin_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: ae_performance_snapshots ae_performance_snapshots_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_performance_snapshots
    ADD CONSTRAINT ae_performance_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ae_performance_snapshots ae_performance_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ae_performance_snapshots
    ADD CONSTRAINT ae_performance_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: agent_actions agent_actions_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_actions
    ADD CONSTRAINT agent_actions_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_reactions agent_reactions_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_reactions
    ADD CONSTRAINT agent_reactions_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_tasks agent_tasks_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: agent_tasks agent_tasks_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: agent_traces agent_traces_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_traces
    ADD CONSTRAINT agent_traces_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: agent_work_items agent_work_items_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_work_items
    ADD CONSTRAINT agent_work_items_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: auth_account auth_account_userId_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT "auth_account_userId_auth_user_id_fk" FOREIGN KEY ("userId") REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: auth_session auth_session_userId_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT "auth_session_userId_auth_user_id_fk" FOREIGN KEY ("userId") REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: autonomy_config autonomy_config_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomy_config
    ADD CONSTRAINT autonomy_config_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: call_campaign_targets call_campaign_targets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaign_targets
    ADD CONSTRAINT call_campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.call_campaigns(id) ON DELETE CASCADE;


--
-- Name: call_campaign_targets call_campaign_targets_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaign_targets
    ADD CONSTRAINT call_campaign_targets_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: call_campaign_targets call_campaign_targets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaign_targets
    ADD CONSTRAINT call_campaign_targets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: call_campaigns call_campaigns_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaigns
    ADD CONSTRAINT call_campaigns_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: call_campaigns call_campaigns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_campaigns
    ADD CONSTRAINT call_campaigns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: call_scripts call_scripts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_scripts
    ADD CONSTRAINT call_scripts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: call_scripts call_scripts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_scripts
    ADD CONSTRAINT call_scripts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: calls calls_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: calls calls_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: calls calls_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.sequence_enrollments(id);


--
-- Name: calls calls_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: calls calls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: capture_approvals capture_approvals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture_approvals
    ADD CONSTRAINT capture_approvals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_memories chat_memories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_memories
    ADD CONSTRAINT chat_memories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_memories chat_memories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_memories
    ADD CONSTRAINT chat_memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_thread_id_chat_threads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_chat_threads_id_fk FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id);


--
-- Name: chat_threads chat_threads_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_threads chat_threads_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: coaching_insights coaching_insights_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_insights
    ADD CONSTRAINT coaching_insights_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id);


--
-- Name: coaching_insights coaching_insights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_insights
    ADD CONSTRAINT coaching_insights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: coaching_insights coaching_insights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_insights
    ADD CONSTRAINT coaching_insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: code_executions code_executions_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_executions
    ADD CONSTRAINT code_executions_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: code_executions code_executions_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_executions
    ADD CONSTRAINT code_executions_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_auth_user_id_fk FOREIGN KEY (author_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: comments comments_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: companies companies_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: companies companies_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: company_icp_fit company_icp_fit_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_icp_fit
    ADD CONSTRAINT company_icp_fit_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_icp_fit company_icp_fit_icp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_icp_fit
    ADD CONSTRAINT company_icp_fit_icp_id_fkey FOREIGN KEY (icp_id) REFERENCES public.icps(id) ON DELETE CASCADE;


--
-- Name: company_icp_fit company_icp_fit_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_icp_fit
    ADD CONSTRAINT company_icp_fit_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: connected_mailboxes connected_mailboxes_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_mailboxes
    ADD CONSTRAINT connected_mailboxes_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: contacts contacts_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: contacts contacts_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: contacts contacts_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: content_variants content_variants_playbook_id_outreach_playbooks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variants
    ADD CONSTRAINT content_variants_playbook_id_outreach_playbooks_id_fk FOREIGN KEY (playbook_id) REFERENCES public.outreach_playbooks(id) ON DELETE CASCADE;


--
-- Name: content_variants content_variants_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_variants
    ADD CONSTRAINT content_variants_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: context_graph_communities context_graph_communities_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_communities
    ADD CONSTRAINT context_graph_communities_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: context_graph_edges context_graph_edges_source_node_id_context_graph_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_edges
    ADD CONSTRAINT context_graph_edges_source_node_id_context_graph_nodes_id_fk FOREIGN KEY (source_node_id) REFERENCES public.context_graph_nodes(id);


--
-- Name: context_graph_edges context_graph_edges_target_node_id_context_graph_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_edges
    ADD CONSTRAINT context_graph_edges_target_node_id_context_graph_nodes_id_fk FOREIGN KEY (target_node_id) REFERENCES public.context_graph_nodes(id);


--
-- Name: context_graph_edges context_graph_edges_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_edges
    ADD CONSTRAINT context_graph_edges_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: context_graph_nodes context_graph_nodes_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_graph_nodes
    ADD CONSTRAINT context_graph_nodes_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: custom_signals custom_signals_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_signals
    ADD CONSTRAINT custom_signals_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: custom_signals custom_signals_icp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_signals
    ADD CONSTRAINT custom_signals_icp_id_fkey FOREIGN KEY (icp_id) REFERENCES public.icps(id) ON DELETE SET NULL;


--
-- Name: custom_signals custom_signals_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_signals
    ADD CONSTRAINT custom_signals_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: custom_skill_templates custom_skill_templates_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_skill_templates
    ADD CONSTRAINT custom_skill_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: custom_skill_templates custom_skill_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_skill_templates
    ADD CONSTRAINT custom_skill_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: deals deals_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: deals deals_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: deals deals_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: deals deals_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: distillation_samples distillation_samples_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distillation_samples
    ADD CONSTRAINT distillation_samples_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: do_not_call_list do_not_call_list_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.do_not_call_list
    ADD CONSTRAINT do_not_call_list_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: email_optouts email_optouts_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_optouts
    ADD CONSTRAINT email_optouts_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: email_verification_tokens email_verification_tokens_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: enrollment_strategy enrollment_strategy_enrollment_id_sequence_enrollments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_strategy
    ADD CONSTRAINT enrollment_strategy_enrollment_id_sequence_enrollments_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE;


--
-- Name: enrollment_strategy enrollment_strategy_playbook_id_outreach_playbooks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_strategy
    ADD CONSTRAINT enrollment_strategy_playbook_id_outreach_playbooks_id_fk FOREIGN KEY (playbook_id) REFERENCES public.outreach_playbooks(id);


--
-- Name: eval_cases eval_cases_dataset_id_eval_datasets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_cases
    ADD CONSTRAINT eval_cases_dataset_id_eval_datasets_id_fk FOREIGN KEY (dataset_id) REFERENCES public.eval_datasets(id) ON DELETE CASCADE;


--
-- Name: eval_datasets eval_datasets_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_datasets
    ADD CONSTRAINT eval_datasets_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: eval_results eval_results_case_id_eval_cases_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_results
    ADD CONSTRAINT eval_results_case_id_eval_cases_id_fk FOREIGN KEY (case_id) REFERENCES public.eval_cases(id);


--
-- Name: eval_results eval_results_run_id_eval_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eval_results
    ADD CONSTRAINT eval_results_run_id_eval_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.eval_runs(id) ON DELETE CASCADE;


--
-- Name: icp_criteria icp_criteria_icp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icp_criteria
    ADD CONSTRAINT icp_criteria_icp_id_fkey FOREIGN KEY (icp_id) REFERENCES public.icps(id) ON DELETE CASCADE;


--
-- Name: icp_field_catalog icp_field_catalog_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icp_field_catalog
    ADD CONSTRAINT icp_field_catalog_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: icps icps_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icps
    ADD CONSTRAINT icps_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: icps icps_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icps
    ADD CONSTRAINT icps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: import_history import_history_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: import_history import_history_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: inbox_triage inbox_triage_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_triage
    ADD CONSTRAINT inbox_triage_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: intelligence_briefs intelligence_briefs_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_briefs
    ADD CONSTRAINT intelligence_briefs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: intelligence_briefs intelligence_briefs_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_briefs
    ADD CONSTRAINT intelligence_briefs_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: intelligence_briefs intelligence_briefs_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intelligence_briefs
    ADD CONSTRAINT intelligence_briefs_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: knowledge_entries knowledge_entries_created_by_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_entries
    ADD CONSTRAINT knowledge_entries_created_by_auth_user_id_fk FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: knowledge_entries knowledge_entries_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_entries
    ADD CONSTRAINT knowledge_entries_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: llm_eval_case_runs llm_eval_case_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_eval_case_runs
    ADD CONSTRAINT llm_eval_case_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.llm_eval_runs(id) ON DELETE CASCADE;


--
-- Name: notes notes_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: notes notes_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notetaker_exposures notetaker_exposures_activity_id_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_exposures
    ADD CONSTRAINT notetaker_exposures_activity_id_activities_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: notetaker_exposures notetaker_exposures_activity_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_exposures
    ADD CONSTRAINT notetaker_exposures_activity_id_fk FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: notetaker_exposures notetaker_exposures_referring_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_exposures
    ADD CONSTRAINT notetaker_exposures_referring_tenant_id_tenants_id_fk FOREIGN KEY (referring_tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notetaker_exposures notetaker_exposures_signup_attributed_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notetaker_exposures
    ADD CONSTRAINT notetaker_exposures_signup_attributed_tenant_id_tenants_id_fk FOREIGN KEY (signup_attributed_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: notification_preferences notification_preferences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: outbound_emails outbound_emails_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_emails
    ADD CONSTRAINT outbound_emails_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: outbound_emails outbound_emails_enrollment_id_sequence_enrollments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_emails
    ADD CONSTRAINT outbound_emails_enrollment_id_sequence_enrollments_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.sequence_enrollments(id);


--
-- Name: outbound_emails outbound_emails_mailbox_id_connected_mailboxes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_emails
    ADD CONSTRAINT outbound_emails_mailbox_id_connected_mailboxes_id_fk FOREIGN KEY (mailbox_id) REFERENCES public.connected_mailboxes(id);


--
-- Name: outbound_emails outbound_emails_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_emails
    ADD CONSTRAINT outbound_emails_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: outreach_playbooks outreach_playbooks_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_playbooks
    ADD CONSTRAINT outreach_playbooks_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: pending_invites pending_invites_accepted_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_accepted_by_user_id_users_id_fk FOREIGN KEY (accepted_by_user_id) REFERENCES public.users(id);


--
-- Name: pending_invites pending_invites_invited_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_invited_by_user_id_users_id_fk FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id);


--
-- Name: pending_invites pending_invites_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_invites
    ADD CONSTRAINT pending_invites_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: phone_number_pool phone_number_pool_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_number_pool
    ADD CONSTRAINT phone_number_pool_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: playbook_entries playbook_entries_source_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playbook_entries
    ADD CONSTRAINT playbook_entries_source_activity_id_fkey FOREIGN KEY (source_activity_id) REFERENCES public.activities(id);


--
-- Name: playbook_entries playbook_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playbook_entries
    ADD CONSTRAINT playbook_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: prompt_experiment_metrics prompt_experiment_metrics_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_experiment_metrics
    ADD CONSTRAINT prompt_experiment_metrics_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.prompt_experiments(id) ON DELETE CASCADE;


--
-- Name: proposal_assets proposal_assets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_assets
    ADD CONSTRAINT proposal_assets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: proposal_components proposal_components_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_components
    ADD CONSTRAINT proposal_components_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id);


--
-- Name: proposal_components proposal_components_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_components
    ADD CONSTRAINT proposal_components_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: proposal_templates proposal_templates_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_templates
    ADD CONSTRAINT proposal_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: proposal_templates proposal_templates_mapped_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_templates
    ADD CONSTRAINT proposal_templates_mapped_by_user_id_fkey FOREIGN KEY (mapped_by_user_id) REFERENCES public.users(id);


--
-- Name: proposal_templates proposal_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_templates
    ADD CONSTRAINT proposal_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: proposals proposals_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: proposals proposals_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: proposals proposals_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.proposal_templates(id);


--
-- Name: proposals proposals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: referral_credit_events referral_credit_events_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_credit_events
    ADD CONSTRAINT referral_credit_events_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: referral_credit_events referral_credit_events_triggered_by_attribution_tenant_id_tenan; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_credit_events
    ADD CONSTRAINT referral_credit_events_triggered_by_attribution_tenant_id_tenan FOREIGN KEY (triggered_by_attribution_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: referral_credit_events referral_credit_events_triggered_by_exposure_id_notetaker_expos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_credit_events
    ADD CONSTRAINT referral_credit_events_triggered_by_exposure_id_notetaker_expos FOREIGN KEY (triggered_by_exposure_id) REFERENCES public.notetaker_exposures(id) ON DELETE SET NULL;


--
-- Name: saved_views saved_views_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: sequence_enrollments sequence_enrollments_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_enrollments
    ADD CONSTRAINT sequence_enrollments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: sequence_enrollments sequence_enrollments_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_enrollments
    ADD CONSTRAINT sequence_enrollments_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.sequences(id) ON DELETE CASCADE;


--
-- Name: sequence_steps sequence_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequence_steps
    ADD CONSTRAINT sequence_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.sequences(id) ON DELETE CASCADE;


--
-- Name: sequences sequences_icp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_icp_id_fkey FOREIGN KEY (icp_id) REFERENCES public.icps(id) ON DELETE SET NULL;


--
-- Name: sequences sequences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sequences
    ADD CONSTRAINT sequences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: shared_prompts shared_prompts_author_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_prompts
    ADD CONSTRAINT shared_prompts_author_id_auth_user_id_fk FOREIGN KEY (author_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: shared_prompts shared_prompts_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_prompts
    ADD CONSTRAINT shared_prompts_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: system_trust_score system_trust_score_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_trust_score
    ADD CONSTRAINT system_trust_score_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tam_proposals tam_proposals_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tam_proposals
    ADD CONSTRAINT tam_proposals_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id);


--
-- Name: tam_proposals tam_proposals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tam_proposals
    ADD CONSTRAINT tam_proposals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tasks tasks_assignee_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_users_id_fk FOREIGN KEY (assignee_id) REFERENCES public.users(id);


--
-- Name: tasks tasks_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_referral_credits tenant_referral_credits_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_referral_credits
    ADD CONSTRAINT tenant_referral_credits_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tool_call_events tool_call_events_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_events
    ADD CONSTRAINT tool_call_events_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tool_call_events tool_call_events_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_events
    ADD CONSTRAINT tool_call_events_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id);


--
-- Name: usage_events usage_events_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: user_mfa_secrets user_mfa_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_secrets
    ADD CONSTRAINT user_mfa_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_auth_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_auth_user_id_fk FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: voice_usage_monthly voice_usage_monthly_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_usage_monthly
    ADD CONSTRAINT voice_usage_monthly_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: voicemail_templates voicemail_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voicemail_templates
    ADD CONSTRAINT voicemail_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: warmup_emails warmup_emails_mailbox_id_connected_mailboxes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_emails
    ADD CONSTRAINT warmup_emails_mailbox_id_connected_mailboxes_id_fk FOREIGN KEY (mailbox_id) REFERENCES public.connected_mailboxes(id);


--
-- Name: warmup_emails warmup_emails_target_mailbox_id_connected_mailboxes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warmup_emails
    ADD CONSTRAINT warmup_emails_target_mailbox_id_connected_mailboxes_id_fk FOREIGN KEY (target_mailbox_id) REFERENCES public.connected_mailboxes(id);


--
-- Name: account_health_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_health_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: account_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: action_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.action_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: ae_performance_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ae_performance_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_traces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_traces ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_work_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_work_items ENABLE ROW LEVEL SECURITY;

--
-- Name: autonomy_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.autonomy_config ENABLE ROW LEVEL SECURITY;

--
-- Name: call_campaign_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_campaign_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: call_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: call_scripts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_scripts ENABLE ROW LEVEL SECURITY;

--
-- Name: calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

--
-- Name: capture_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capture_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_memories ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaching_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: code_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_icp_fit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_icp_fit ENABLE ROW LEVEL SECURITY;

--
-- Name: connected_mailboxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connected_mailboxes ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: content_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: context_graph_communities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.context_graph_communities ENABLE ROW LEVEL SECURITY;

--
-- Name: context_graph_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.context_graph_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: context_graph_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.context_graph_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_records ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_skill_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_skill_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: distillation_samples; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.distillation_samples ENABLE ROW LEVEL SECURITY;

--
-- Name: do_not_call_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.do_not_call_list ENABLE ROW LEVEL SECURITY;

--
-- Name: email_optouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_optouts ENABLE ROW LEVEL SECURITY;

--
-- Name: embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

--
-- Name: eval_datasets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eval_datasets ENABLE ROW LEVEL SECURITY;

--
-- Name: icp_field_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.icp_field_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: icps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.icps ENABLE ROW LEVEL SECURITY;

--
-- Name: import_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

--
-- Name: inbound_visitors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_visitors ENABLE ROW LEVEL SECURITY;

--
-- Name: inbound_write_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_write_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_triage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_triage ENABLE ROW LEVEL SECURITY;

--
-- Name: intelligence_briefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.intelligence_briefs ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbound_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_playbooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_playbooks ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_number_pool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phone_number_pool ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

--
-- Name: playbook_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.playbook_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_experiment_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_experiment_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_components ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_credit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_credit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: sending_infra_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sending_infra_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: sequence_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sequence_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_prompts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_prompts ENABLE ROW LEVEL SECURITY;

--
-- Name: signal_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: system_trust_score; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_trust_score ENABLE ROW LEVEL SECURITY;

--
-- Name: tam_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tam_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: account_health_snapshots tenant_isolation_account_health_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_account_health_snapshots ON public.account_health_snapshots USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: account_suppressions tenant_isolation_account_suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_account_suppressions ON public.account_suppressions USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: action_outcomes tenant_isolation_action_outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_action_outcomes ON public.action_outcomes USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: activities tenant_isolation_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_activities ON public.activities USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: ae_performance_snapshots tenant_isolation_ae_performance_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_ae_performance_snapshots ON public.ae_performance_snapshots USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: agent_actions tenant_isolation_agent_actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_agent_actions ON public.agent_actions USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: agent_reactions tenant_isolation_agent_reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_agent_reactions ON public.agent_reactions USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: agent_tasks tenant_isolation_agent_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_agent_tasks ON public.agent_tasks USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: agent_traces tenant_isolation_agent_traces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_agent_traces ON public.agent_traces USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: agent_work_items tenant_isolation_agent_work_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_agent_work_items ON public.agent_work_items USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: autonomy_config tenant_isolation_autonomy_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_autonomy_config ON public.autonomy_config USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: call_campaign_targets tenant_isolation_call_campaign_targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_call_campaign_targets ON public.call_campaign_targets USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: call_campaigns tenant_isolation_call_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_call_campaigns ON public.call_campaigns USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: call_scripts tenant_isolation_call_scripts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_call_scripts ON public.call_scripts USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: calls tenant_isolation_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_calls ON public.calls USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: capture_approvals tenant_isolation_capture_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_capture_approvals ON public.capture_approvals USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: chat_memories tenant_isolation_chat_memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_chat_memories ON public.chat_memories USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: chat_threads tenant_isolation_chat_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_chat_threads ON public.chat_threads USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: coaching_insights tenant_isolation_coaching_insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_coaching_insights ON public.coaching_insights USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: code_executions tenant_isolation_code_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_code_executions ON public.code_executions USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: comments tenant_isolation_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_comments ON public.comments USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: companies tenant_isolation_companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_companies ON public.companies USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: company_icp_fit tenant_isolation_company_icp_fit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_company_icp_fit ON public.company_icp_fit USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: connected_mailboxes tenant_isolation_connected_mailboxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_connected_mailboxes ON public.connected_mailboxes USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: contacts tenant_isolation_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_contacts ON public.contacts USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: content_variants tenant_isolation_content_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_content_variants ON public.content_variants USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: context_graph_communities tenant_isolation_context_graph_communities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_context_graph_communities ON public.context_graph_communities USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: context_graph_edges tenant_isolation_context_graph_edges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_context_graph_edges ON public.context_graph_edges USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: context_graph_nodes tenant_isolation_context_graph_nodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_context_graph_nodes ON public.context_graph_nodes USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: custom_records tenant_isolation_custom_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_custom_records ON public.custom_records USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: custom_signals tenant_isolation_custom_signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_custom_signals ON public.custom_signals USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: custom_skill_templates tenant_isolation_custom_skill_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_custom_skill_templates ON public.custom_skill_templates USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: customer_requests tenant_isolation_customer_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_customer_requests ON public.customer_requests USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: deals tenant_isolation_deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_deals ON public.deals USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: distillation_samples tenant_isolation_distillation_samples; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_distillation_samples ON public.distillation_samples USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: do_not_call_list tenant_isolation_do_not_call_list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_do_not_call_list ON public.do_not_call_list USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: email_optouts tenant_isolation_email_optouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_email_optouts ON public.email_optouts USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: embeddings tenant_isolation_embeddings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_embeddings ON public.embeddings USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: eval_datasets tenant_isolation_eval_datasets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_eval_datasets ON public.eval_datasets USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: icp_field_catalog tenant_isolation_icp_field_catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_icp_field_catalog ON public.icp_field_catalog USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: icps tenant_isolation_icps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_icps ON public.icps USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: import_history tenant_isolation_import_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_import_history ON public.import_history USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: inbound_visitors tenant_isolation_inbound_visitors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_inbound_visitors ON public.inbound_visitors USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: inbound_write_keys tenant_isolation_inbound_write_keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_inbound_write_keys ON public.inbound_write_keys USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: inbox_triage tenant_isolation_inbox_triage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_inbox_triage ON public.inbox_triage USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: intelligence_briefs tenant_isolation_intelligence_briefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_intelligence_briefs ON public.intelligence_briefs USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: knowledge_entries tenant_isolation_knowledge_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_knowledge_entries ON public.knowledge_entries USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: llm_calls tenant_isolation_llm_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_llm_calls ON public.llm_calls USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: notes tenant_isolation_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_notes ON public.notes USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: notification_preferences tenant_isolation_notification_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_notification_preferences ON public.notification_preferences USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: notifications tenant_isolation_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_notifications ON public.notifications USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: onboarding_progress tenant_isolation_onboarding_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_onboarding_progress ON public.onboarding_progress USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: outbound_emails tenant_isolation_outbound_emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_outbound_emails ON public.outbound_emails USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: outreach_playbooks tenant_isolation_outreach_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_outreach_playbooks ON public.outreach_playbooks USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: pending_invites tenant_isolation_pending_invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_pending_invites ON public.pending_invites USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: phone_number_pool tenant_isolation_phone_number_pool; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_phone_number_pool ON public.phone_number_pool USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: pipeline_events tenant_isolation_pipeline_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_pipeline_events ON public.pipeline_events USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: playbook_entries tenant_isolation_playbook_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_playbook_entries ON public.playbook_entries USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: prompt_experiment_metrics tenant_isolation_prompt_experiment_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_prompt_experiment_metrics ON public.prompt_experiment_metrics USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: proposal_assets tenant_isolation_proposal_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_proposal_assets ON public.proposal_assets USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: proposal_components tenant_isolation_proposal_components; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_proposal_components ON public.proposal_components USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: proposal_templates tenant_isolation_proposal_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_proposal_templates ON public.proposal_templates USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: proposals tenant_isolation_proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_proposals ON public.proposals USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: referral_credit_events tenant_isolation_referral_credit_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_referral_credit_events ON public.referral_credit_events USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: sending_infra_requests tenant_isolation_sending_infra_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_sending_infra_requests ON public.sending_infra_requests USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: sequence_drafts tenant_isolation_sequence_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_sequence_drafts ON public.sequence_drafts USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: sequences tenant_isolation_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_sequences ON public.sequences USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: shared_prompts tenant_isolation_shared_prompts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_shared_prompts ON public.shared_prompts USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: signal_outcomes tenant_isolation_signal_outcomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_signal_outcomes ON public.signal_outcomes USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: subscriptions tenant_isolation_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_subscriptions ON public.subscriptions USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: system_trust_score tenant_isolation_system_trust_score; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_system_trust_score ON public.system_trust_score USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: tam_proposals tenant_isolation_tam_proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tam_proposals ON public.tam_proposals USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: tasks tenant_isolation_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tasks ON public.tasks USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: tenant_referral_credits tenant_isolation_tenant_referral_credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tenant_referral_credits ON public.tenant_referral_credits USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: tool_call_events tenant_isolation_tool_call_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tool_call_events ON public.tool_call_events USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: transcript_chunks tenant_isolation_transcript_chunks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_transcript_chunks ON public.transcript_chunks USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: trust_events tenant_isolation_trust_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_trust_events ON public.trust_events USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: usage_events tenant_isolation_usage_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_usage_events ON public.usage_events USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: users tenant_isolation_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_users ON public.users USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: visitor_id_charges tenant_isolation_visitor_id_charges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_visitor_id_charges ON public.visitor_id_charges USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: visits tenant_isolation_visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_visits ON public.visits USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: voice_usage_monthly tenant_isolation_voice_usage_monthly; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_voice_usage_monthly ON public.voice_usage_monthly USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: voicemail_templates tenant_isolation_voicemail_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_voicemail_templates ON public.voicemail_templates USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: webhook_events tenant_isolation_webhook_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_webhook_events ON public.webhook_events USING (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true)))) WITH CHECK (((NULLIF(current_setting('app.tenant_id'::text, true), ''::text) IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id'::text, true))));


--
-- Name: tenant_referral_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_referral_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_call_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_call_events ENABLE ROW LEVEL SECURITY;

--
-- Name: transcript_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transcript_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: trust_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trust_events ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_id_charges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_id_charges ENABLE ROW LEVEL SECURITY;

--
-- Name: visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_usage_monthly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_usage_monthly ENABLE ROW LEVEL SECURITY;

--
-- Name: voicemail_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voicemail_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


