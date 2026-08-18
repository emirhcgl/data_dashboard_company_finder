import { NextRequest, NextResponse } from "next/server";
import { assertRuntimeEnv } from "@/app/lib/env";
import { parseTargetFilters } from "@/app/lib/target-filters";
import {
  CRM_FILTER_SCAN_LIMIT,
  applyCrmFilters,
  enrichRowsWithCrm,
} from "@/app/lib/crm";
import { hasCrmFilter, list } from "@/app/models/targets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    assertRuntimeEnv();

    const filters = parseTargetFilters(new URL(req.url).searchParams);
    const offset = (filters.page - 1) * filters.pageSize;

    // CRM data comes from an HTTP API, so a CRM filter cannot be pushed into SQL:
    // scan a capped slice, enrich, filter, then paginate in memory.
    if (hasCrmFilter(filters)) {
      const scanned = await list(filters, {
        limit: CRM_FILTER_SCAN_LIMIT,
        offset: 0,
      });

      const enriched = await enrichRowsWithCrm(scanned.rows, {
        refresh: filters.refreshCrm,
      });

      const filtered = applyCrmFilters(enriched.rows, filters);

      return NextResponse.json({
        data: filtered.slice(offset, offset + filters.pageSize),
        total: filtered.length,
        page: filters.page,
        pageSize: filters.pageSize,
        sort: filters.sort,
        dir: filters.dir,
        crm_available: enriched.available,
        crm_errors: enriched.errors,
        crm_filter_applied_in_memory: true,
        scan_limit: CRM_FILTER_SCAN_LIMIT,
        scan_truncated: scanned.total > CRM_FILTER_SCAN_LIMIT,
      });
    }

    const result = await list(filters, {
      limit: filters.pageSize,
      offset,
    });

    const enriched = await enrichRowsWithCrm(result.rows, {
      refresh: filters.refreshCrm,
    });

    return NextResponse.json({
      data: enriched.rows,
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
      sort: filters.sort,
      dir: filters.dir,
      crm_available: enriched.available,
      crm_errors: enriched.errors,
      crm_filter_applied_in_memory: false,
    });
  } catch (error) {
    console.error("TARGETS ERROR:", error);

    return NextResponse.json(
      { error: "Failed to fetch targets" },
      { status: 500 },
    );
  }
}
