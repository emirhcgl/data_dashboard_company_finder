// The CRM contact shape, shared by the server model (models/twenty.ts) and the
// client components. It lives in its own module because models/twenty.ts imports
// the database pool, which must never reach the browser bundle.
//
// Field names mirror the Twenty `people` object: the engagement columns are the
// `is*` booleans, and `vdmamemberid` is the join key back to a VDMA member.

/** Engagement flags on the CRM person object, in display order. */
export const CRM_FLAGS = [
  { key: "is_contacted", field: "isContacted", label: "Contacted" },
  { key: "is_email_opened", field: "isEmailOpened", label: "E-mail opened" },
  { key: "is_link_clicked", field: "isLinkClicked", label: "Link clicked" },
  {
    key: "is_study_downloaded",
    field: "isStudyDownloaded",
    label: "Study downloaded",
  },
  { key: "is_email_replied", field: "isEmailReplied", label: "Replied" },
  {
    key: "is_benchmark_tool_used",
    field: "isBenchmarkToolUsed",
    label: "Benchmark tool used",
  },
  {
    key: "is_calendly_link_sent",
    field: "isCalendlyLinkSent",
    label: "Calendly link sent",
  },
  {
    key: "is_meeting_requested",
    field: "isMeetingRequested",
    label: "Meeting requested",
  },
  {
    key: "is_meeting_booked",
    field: "isMeetingBooked",
    label: "Meeting booked",
  },
  {
    key: "is_calendly_meeting_booked",
    field: "isCalendlyMeetingBooked",
    label: "Calendly meeting booked",
  },
] as const;

export type CrmFlagKey = (typeof CRM_FLAGS)[number]["key"];

export type CrmFlags = Record<CrmFlagKey, boolean>;

export const EMPTY_CRM_FLAGS: CrmFlags = Object.fromEntries(
  CRM_FLAGS.map((f) => [f.key, false]),
) as CrmFlags;

export type CrmContact = {
  crm_id: string | null;
  crm_url: string | null;
  full_name: string | null;
  current_title: string | null;
  current_company: string | null;
  email: string | null;
  linkedin_url: string | null;
  location: string | null;
  is_right_contact: boolean | null;
  created_at: string | null;
  updated_at: string | null;
} & CrmFlags;

/** Aggregate of every CRM contact that carries this member id. */
export type CrmEnrichment = {
  in_crm: boolean;
  contact_count: number;
  /** OR of the flag across all contacts of the member. */
  flags: CrmFlags;
  /** Best contacts first, capped by the model's MAX_CONTACTS_PER_MEMBER. */
  contacts: CrmContact[];
  vdma_company_name: string | null;
  last_update: string | null;
  fetched_at: string;
};
