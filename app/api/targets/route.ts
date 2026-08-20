import { NextRequest, NextResponse } from "next/server";
import { assertRuntimeEnv } from "@/app/lib/env";
import { parseTargetFilters } from "@/app/lib/target-filters";
import { enrichRowsWithCrm, resolveCrmMemberIds } from "@/app/lib/crm";
import {
  hasCrmFilter,
  list,
  type MemberIdRestriction,
} from "@/app/models/targets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    assertRuntimeEnv();

    const filters = parseTargetFilters(new URL(req.url).searchParams);
    const offset = (filters.page - 1) * filters.pageSize;

    // CRM data comes from an HTTP API, so a CRM filter cannot be expressed in
    // SQL directly. Ask the CRM which member ids match and push those ids into
    // the query, so paging and counts stay exact and no row is dropped because a
    // lookup was rate-limited.
    let restrict: MemberIdRestriction | undefined;

    if (hasCrmFilter(filters)) {
      const resolved = await resolveCrmMemberIds(filters);

      if (!resolved.ok) {
        return NextResponse.json(
          {
            error:
              "The CRM did not answer completely, so the CRM filter cannot be applied. Try again in a minute.",
          },
          { status: 503 },
        );
      }

      if (resolved.impossible) {
        return NextResponse.json({
          data: [],
          total: 0,
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort,
          dir: filters.dir,
          crm_available: true,
          crm_errors: 0,
        });
      }

      restrict = { include: resolved.include, exclude: resolved.exclude };
    }

    const result = await list(filters, {
      limit: filters.pageSize,
      offset,
      restrict,
    });

    const enriched = await enrichRowsWithCrm(result.rows);

    return NextResponse.json({
      data: enriched.rows,
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
      sort: filters.sort,
      dir: filters.dir,
      crm_available: enriched.available,
      crm_errors: enriched.errors,
    });
  } catch (error) {
    console.error("TARGETS ERROR:", error);

    return NextResponse.json(
      { error: "Failed to fetch targets" },
      { status: 500 },
    );
  }
}
