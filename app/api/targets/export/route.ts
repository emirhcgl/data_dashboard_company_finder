import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { assertRuntimeEnv } from "@/app/lib/env";
import { describeFilters, parseTargetFilters } from "@/app/lib/target-filters";
import { enrichRowsWithCrm, resolveCrmMemberIds } from "@/app/lib/crm";
import { CRM_FLAGS } from "@/app/models/crm-flags";
import {
  hasCrmFilter,
  list,
  type MemberIdRestriction,
} from "@/app/models/targets";
import { nonEmptyTechCategories } from "@/app/models/technologies";

export const dynamic = "force-dynamic";

// Hard cap so a filter-free export cannot exhaust memory.
const EXPORT_LIMIT = 20000;

export async function GET(req: NextRequest) {
  try {
    assertRuntimeEnv();

    const filters = parseTargetFilters(new URL(req.url).searchParams);

    // A CRM filter is resolved to member ids first (see lib/crm.ts) so the
    // export contains exactly the rows the table shows.
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

      restrict = { include: resolved.include, exclude: resolved.exclude };
    }

    // Same filters, same sort, same query as the table - just unpaginated.
    const result = await list(filters, {
      limit: EXPORT_LIMIT,
      offset: 0,
      restrict,
    });

    const enriched = await enrichRowsWithCrm(result.rows);

    const rows = enriched.rows;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Company Targeting";
    wb.created = new Date();

    const ws = wb.addWorksheet("Targets");

    ws.columns = [
      { header: "Score", key: "score", width: 8 },
      { header: "VDMA Member ID", key: "vdma_member_id", width: 14 },
      { header: "Company", key: "company_name", width: 38 },
      { header: "Industry", key: "industry", width: 30 },
      { header: "City", key: "city", width: 20 },
      { header: "Postal code", key: "postal_code", width: 12 },
      { header: "State", key: "state", width: 22 },
      { header: "Country", key: "country", width: 14 },
      { header: "Headquarters (LinkedIn)", key: "headquarters", width: 26 },
      { header: "LinkedIn size", key: "company_size_approx", width: 16 },
      { header: "Employees (scraped)", key: "employee_count", width: 18 },
      { header: "Followers", key: "linkedin_followers_numeric", width: 12 },
      { header: "Website", key: "website", width: 34 },
      { header: "Domain", key: "company_domain", width: 26 },
      { header: "LinkedIn URL", key: "linkedin_url", width: 40 },
      { header: "Company e-mail", key: "company_email", width: 30 },
      { header: "E-mail source", key: "email_source", width: 14 },
      { header: "Top contacts", key: "top_contacts", width: 60 },
      { header: "Performance", key: "benchmark_home_performance_score", width: 12 },
      { header: "SEO", key: "benchmark_home_seo_score", width: 10 },
      { header: "Accessibility", key: "benchmark_home_accessibility_score", width: 12 },
      { header: "Best practices", key: "benchmark_home_best_practices_score", width: 14 },
      { header: "Has blog", key: "benchmark_sitewide_sitewide_has_blog", width: 10 },
      { header: "Has whitepapers", key: "benchmark_sitewide_sitewide_has_whitepapers", width: 15 },
      { header: "Has case studies", key: "benchmark_sitewide_sitewide_has_case_studies", width: 15 },
      { header: "Has downloads", key: "benchmark_sitewide_sitewide_has_downloads", width: 13 },
      { header: "Traffic rank", key: "traffic_rank", width: 12 },
      { header: "Tech summary", key: "tech_summary", width: 40 },
      { header: "Tech categories detected", key: "tech_categories", width: 50 },
      { header: "Contacted before", key: "contacted_before", width: 15 },
      { header: "Lead status", key: "lead_status", width: 16 },
      { header: "Added to Smartlead", key: "added_to_smartlead_at", width: 20 },
      { header: "E-mails sent", key: "emails_sent", width: 12 },
      { header: "Opened", key: "is_email_opened", width: 9 },
      { header: "Clicked", key: "is_email_link_clicked", width: 9 },
      { header: "Study downloaded", key: "is_study_downloaded", width: 16 },
      { header: "Replies", key: "replies", width: 9 },
      { header: "Reply category", key: "reply_category", width: 18 },
      { header: "Hot lead", key: "is_hot_lead", width: 10 },
      { header: "Unsubscribed", key: "is_unsubscribed", width: 12 },
      { header: "Last sent at", key: "last_sent_at", width: 20 },
      { header: "Last reply at", key: "last_received_at", width: 20 },
      { header: "Outreach match", key: "outreach_match", width: 14 },
      { header: "In CRM", key: "in_crm", width: 9 },
      { header: "CRM contacts", key: "crm_contact_count", width: 13 },
      ...CRM_FLAGS.map((f) => ({
        header: `CRM: ${f.label}`,
        key: `crm_${f.key}`,
        width: 14,
      })),
      { header: "CRM top contact", key: "crm_top_contact", width: 30 },
      { header: "CRM last update", key: "crm_last_update", width: 20 },
      { header: "CRM link", key: "crm_url", width: 40 },
      { header: "Blacklisted", key: "is_in_blacklist", width: 11 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEEEEE" },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ws.columns.length },
    };

    for (const row of rows) {
      ws.addRow({
        ...row,
        top_contacts: (row.top_contacts ?? [])
          .map((c) => [c.full_name, c.current_title].filter(Boolean).join(" - "))
          .join(" ; "),
        tech_categories: nonEmptyTechCategories(row).join(", "),
        crm_contact_count: row.crm?.contact_count ?? null,
        ...Object.fromEntries(
          CRM_FLAGS.map((f) => [`crm_${f.key}`, row.crm?.flags[f.key] ?? null]),
        ),
        crm_top_contact: row.crm?.contacts[0]
          ? [row.crm.contacts[0].full_name, row.crm.contacts[0].current_title]
              .filter(Boolean)
              .join(" - ")
          : null,
        crm_last_update: row.crm?.last_update ?? null,
        crm_url: row.crm?.contacts[0]?.crm_url ?? null,
      });
    }

    const meta = wb.addWorksheet("Filters");
    meta.columns = [
      { header: "Filter", key: "filter", width: 28 },
      { header: "Value", key: "value", width: 60 },
    ];
    meta.getRow(1).font = { bold: true };
    meta.addRow({ filter: "Exported at", value: new Date().toISOString() });
    meta.addRow({ filter: "Rows", value: String(rows.length) });
    meta.addRow({
      filter: "Matching rows (before CRM filter)",
      value: String(result.total),
    });
    meta.addRow({
      filter: "Export row cap",
      value: String(EXPORT_LIMIT),
    });
    meta.addRow({
      filter: "CRM enrichment available",
      value: String(enriched.available),
    });

    for (const [filter, value] of describeFilters(filters)) {
      meta.addRow({ filter, value });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="target_list_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("TARGETS EXPORT ERROR:", error);

    return NextResponse.json(
      { error: "Failed to export targets" },
      { status: 500 },
    );
  }
}
