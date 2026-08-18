"use client";

import { useEffect, useState } from "react";
import { ApiTargetRow } from "./filter-state";

type DetailPayload = ApiTargetRow & {
  tech_categories: string[];
  employees: {
    employee_id: number;
    full_name: string | null;
    current_title: string | null;
    linkedin_url: string | null;
    location: string | null;
  }[];
  conversations: {
    id: number;
    subject: string | null;
    direction: string | null;
    reply_category: string | null;
    received_at: string | null;
    created_at: string | null;
  }[];
  leads: {
    id: number;
    email: string;
    status: string;
    added_to_smartlead_at: string | null;
  }[];
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-1 text-sm dark:border-zinc-900">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{value ?? "-"}</span>
    </div>
  );
}

export default function TargetDetail({
  memberId,
  onClose,
}: {
  memberId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    setData(null);
    setError("");

    fetch(`/api/targets/${memberId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setData(body.data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this company.");
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-950">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {data?.company_name ?? `Member ${memberId}`}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            Close
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!data && !error && <p className="text-sm text-zinc-400">Loading...</p>}

        {data && (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Score {data.score}
              </h3>

              {(data.score_breakdown?.components ?? []).map((component) => (
                <Row
                  key={component.key}
                  label={`${component.label} (w ${component.weight})`}
                  value={`${component.points} pts`}
                />
              ))}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Company
              </h3>

              <Row label="VDMA member id" value={data.vdma_member_id} />
              <Row label="Industry" value={data.industry} />
              <Row label="LinkedIn size" value={data.company_size_approx} />
              <Row label="People scraped" value={data.employee_count} />
              <Row label="Followers" value={data.linkedin_followers_numeric} />
              <Row label="City" value={data.city} />
              <Row label="Postal code" value={data.postal_code} />
              <Row label="State" value={data.state} />
              <Row label="Country" value={data.country} />
              <Row label="Headquarters" value={data.headquarters} />
              <Row label="Website" value={data.website} />
              <Row label="E-mail" value={data.company_email} />
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Benchmark
              </h3>

              {data.has_benchmark ? (
                <>
                  <Row
                    label="Performance"
                    value={data.benchmark_home_performance_score}
                  />
                  <Row label="SEO" value={data.benchmark_home_seo_score} />
                  <Row
                    label="Accessibility"
                    value={data.benchmark_home_accessibility_score}
                  />
                  <Row
                    label="Best practices"
                    value={data.benchmark_home_best_practices_score}
                  />
                  <Row
                    label="Blog / whitepapers / cases / downloads"
                    value={[
                      data.benchmark_sitewide_sitewide_has_blog,
                      data.benchmark_sitewide_sitewide_has_whitepapers,
                      data.benchmark_sitewide_sitewide_has_case_studies,
                      data.benchmark_sitewide_sitewide_has_downloads,
                    ]
                      .map((v) => (v ? "yes" : "no"))
                      .join(" / ")}
                  />
                </>
              ) : (
                <p className="text-sm text-zinc-400">No benchmark yet.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Outreach ({data.outreach_match} match)
              </h3>

              <Row label="Lead status" value={data.lead_status} />
              <Row label="E-mails sent" value={data.emails_sent} />
              <Row label="Replies" value={data.replies} />
              <Row label="Reply category" value={data.reply_category} />
              <Row label="Opened" value={data.is_email_opened ? "yes" : "no"} />
              <Row
                label="Clicked"
                value={data.is_email_link_clicked ? "yes" : "no"}
              />
              <Row
                label="Study downloaded"
                value={data.is_study_downloaded ? "yes" : "no"}
              />
              <Row label="Hot lead" value={data.is_hot_lead ? "yes" : "no"} />
              <Row
                label="Unsubscribed"
                value={data.is_unsubscribed ? "yes" : "no"}
              />

              {data.conversations.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                  {data.conversations.slice(0, 10).map((c) => (
                    <li key={c.id}>
                      [{c.direction ?? "?"}] {c.subject ?? "(no subject)"}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                CRM
              </h3>

              {!data.crm_available && (
                <p className="text-sm text-zinc-400">CRM not configured.</p>
              )}

              {data.crm_available && !data.in_crm && (
                <p className="text-sm text-zinc-400">Not found in CRM.</p>
              )}

              {data.crm && (
                <>
                  <Row label="Name" value={data.crm.crm_name} />
                  <Row label="Stage" value={data.crm.crm_stage} />
                  <Row label="Owner" value={data.crm.crm_owner} />
                  <Row
                    label="Link"
                    value={
                      data.crm.crm_url ? (
                        <a
                          href={data.crm.crm_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          open
                        </a>
                      ) : (
                        "-"
                      )
                    }
                  />
                </>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Technologies
              </h3>

              <p className="text-sm text-zinc-500">
                {data.tech_categories.length
                  ? data.tech_categories.join(", ")
                  : "No website scan yet."}
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                People ({data.employees.length})
              </h3>

              <ul className="space-y-1 text-sm">
                {data.employees.slice(0, 25).map((employee) => (
                  <li key={employee.employee_id}>
                    {employee.linkedin_url ? (
                      <a
                        href={employee.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {employee.full_name}
                      </a>
                    ) : (
                      employee.full_name
                    )}

                    <span className="text-zinc-400">
                      {employee.current_title ? ` - ${employee.current_title}` : ""}
                    </span>
                  </li>
                ))}

                {data.employees.length === 0 && (
                  <li className="text-zinc-400">No people scraped yet.</li>
                )}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
