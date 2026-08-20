import { NextResponse } from "next/server";
import { assertRuntimeEnv } from "@/app/lib/env";
import { distinctCities, distinctCountries } from "@/app/models/members";
import { distinctIndustries, distinctSizes, SIZE_BUCKETS } from "@/app/models/companies";
import { distinctStatuses } from "@/app/models/leads";
import { distinctReplyCategories } from "@/app/models/emails";
import { STATES, UNKNOWN_STATE_LABEL } from "@/app/models/regions";
import { cacheStats } from "@/app/models/twenty";
import { CRM_FLAGS } from "@/app/models/crm-flags";
import { isTwentyConfigured } from "@/app/lib/env";
import { SCORE_COMPONENTS, TARGET_SORTABLE_COLUMNS } from "@/app/models/targets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertRuntimeEnv();

    const [
      countries,
      cities,
      industries,
      sizes,
      leadStatuses,
      replyCategories,
      crm,
    ] = await Promise.all([
      distinctCountries(),
      distinctCities(),
      distinctIndustries(),
      distinctSizes(),
      distinctStatuses(),
      distinctReplyCategories(),
      cacheStats(),
    ]);

    return NextResponse.json({
      countries,
      cities,
      industries,
      sizes,
      sizeBuckets: SIZE_BUCKETS.map((b) => b.value),
      states: [
        ...STATES.map((s) => ({ code: s.code, name: s.name })),
        { code: "unknown", name: UNKNOWN_STATE_LABEL },
      ],
      leadStatuses,
      replyCategories,
      crmAvailable: isTwentyConfigured(),
      crmFlags: CRM_FLAGS.map((f) => ({ key: f.key, label: f.label })),
      crmCache: crm,
      sortable: TARGET_SORTABLE_COLUMNS,
      scoreComponents: SCORE_COMPONENTS.map((c) => ({
        key: c.key,
        label: c.label,
        weight: c.weight,
      })),
    });
  } catch (error) {
    console.error("FILTERS ERROR:", error);

    return NextResponse.json(
      { error: "Failed to fetch filter options" },
      { status: 500 },
    );
  }
}
