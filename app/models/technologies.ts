// company_technologies - READ ONLY (Wappalyzer-style website scan).

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_TECH_TABLE ?? "company_technologies";

// The ~80 detected-technology category columns. NEVER hand-type this list
// elsewhere - import it.
export const TECH_COLUMNS = [
  "A_B_Testing","Accessibility","Accounting","Advertising","Affiliate_programs",
  "Analytics","Appointment_scheduling","Augmented_reality","Authentication","Blogs",
  "Browser_fingerprinting","Buy_now_pay_later","Caching","Cart_abandonment","CDN",
  "CI","CMS","Comment_systems","Containers","Content_curation","Control_systems",
  "Cookie_compliance","CRM","Cross_border_ecommerce","Cryptominers",
  "Customer_data_platform","Database_managers","Databases","Development",
  "Digital_asset_management","DMS","Documentation","Domain_parking","Drupal_themes",
  "Ecommerce","Ecommerce_frontends","Editors","Email","Feature_management",
  "Feed_readers","Font_scripts","Form_builders","Fulfilment","Fundraising_donations",
  "Geolocation","Hosting","Hosting_panels","IaaS","Issue_trackers",
  "JavaScript_frameworks","JavaScript_graphics","JavaScript_libraries","Live_chat",
  "Livestreaming","LMS","Load_balancers","Loyalty_rewards","Maps",
  "Marketing_automation","Media_servers","Message_boards","Miscellaneous",
  "Mobile_frameworks","Network_devices","Network_storage","Operating_systems","PaaS",
  "Page_builders","Payment_processors","Performance","Personalization",
  "Photo_galleries","Programming_languages","Recruitment_staffing",
  "Referral_marketing","Remote_access","Reservations_delivery",
] as const;

export type TechColumn = (typeof TECH_COLUMNS)[number];

// The compact set shown in the on-screen table. The export writes every
// non-empty category from TECH_COLUMNS.
export const TECH_SUMMARY_COLUMNS: TechColumn[] = [
  "CMS",
  "Analytics",
  "CRM",
  "Marketing_automation",
  "Hosting",
];

export type TechnologyRow = {
  technology_id: number;
  vdma_member_id: number | null;
  tech_url: string | null;
  tech_status: number | null;
  tech_message: string | null;
  traffic_rank: number | null;
} & { [K in TechColumn as `tech_${K}`]: string | null };

// `t."CMS" AS "tech_CMS"` for every category, plus the identity columns.
export const TECH_CATEGORY_SELECT = TECH_COLUMNS.map(
  (col) => `  t."${col}" AS "tech_${col}"`,
).join(",\n");

export const TECH_SELECT = `
  t.id            AS technology_id,
  t.vdma_member_id AS vdma_member_id,
  t."URL"         AS tech_url,
  t."Status"      AS tech_status,
  t."Message"     AS tech_message,
  t."Traffic_rank" AS traffic_rank,
${TECH_CATEGORY_SELECT}
`;

// One scan per member: newest row wins.
export const TECH_LATEST_CTE = `
  SELECT DISTINCT ON (t.vdma_member_id) ${TECH_SELECT}
    FROM ${TABLE} t
   WHERE t.vdma_member_id IS NOT NULL
   ORDER BY t.vdma_member_id, t.id DESC
`;

export function techSummary(
  row: Partial<Record<`tech_${TechColumn}`, string | null>>,
): string {
  return TECH_SUMMARY_COLUMNS.map((col) => row[`tech_${col}`])
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" | ");
}

export function nonEmptyTechCategories(
  row: Partial<Record<`tech_${TechColumn}`, string | null>>,
): TechColumn[] {
  return TECH_COLUMNS.filter((col) => {
    const value = row[`tech_${col}`];
    return Boolean(value && String(value).trim());
  });
}

export async function findByMemberId(id: number): Promise<TechnologyRow | null> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query<TechnologyRow>(
      `SELECT ${TECH_SELECT}
         FROM ${TABLE} t
        WHERE t.vdma_member_id = @id
        ORDER BY t.id DESC
        LIMIT 1;`,
    );

  return result.recordset[0] ?? null;
}
