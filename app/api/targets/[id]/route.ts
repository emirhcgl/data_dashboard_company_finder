import { NextRequest, NextResponse } from "next/server";
import { assertRuntimeEnv } from "@/app/lib/env";
import { enrichRowsWithCrm } from "@/app/lib/crm";
import { findById } from "@/app/models/targets";
import { listByMemberId } from "@/app/models/employees";
import { listByEmails } from "@/app/models/emails";
import { findByEmails } from "@/app/models/leads";
import { nonEmptyTechCategories } from "@/app/models/technologies";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertRuntimeEnv();

    const { id } = await params;
    const memberId = Number.parseInt(id, 10);

    if (!Number.isFinite(memberId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const target = await findById(memberId);

    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const refresh =
      new URL(req.url).searchParams.get("refreshCrm") === "1";

    const enriched = await enrichRowsWithCrm([target], { refresh });

    const emails = target.company_email ? [target.company_email] : [];

    const [employees, conversations, leads] = await Promise.all([
      listByMemberId(memberId),
      listByEmails(emails),
      findByEmails(emails),
    ]);

    return NextResponse.json({
      data: {
        ...enriched.rows[0],
        tech_categories: nonEmptyTechCategories(target),
        employees,
        conversations,
        leads,
      },
      crm_available: enriched.available,
    });
  } catch (error) {
    console.error("TARGET DETAIL ERROR:", error);

    return NextResponse.json(
      { error: "Failed to fetch target" },
      { status: 500 },
    );
  }
}
