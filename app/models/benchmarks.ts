// company_benchmarking_scores - READ ONLY (benchmark pipeline).

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_BENCHMARKS_TABLE ?? "company_benchmarking_scores";

export type BenchmarkRow = {
  benchmark_id: number;
  vdma_company_id: number | null;
  benchmark_vdma_name: string | null;
  benchmark_company: string | null;
  benchmark_url: string | null;
  benchmark_match_strategy: string | null;
  benchmark_home_words_total: number | null;
  benchmark_home_modules_count: number | null;
  benchmark_home_video_blocks: number | null;
  benchmark_home_prominent_cta_present: number | null;
  benchmark_home_newsletter_present: number | null;
  benchmark_home_blog_present: number | null;
  benchmark_home_resources_present: number | null;
  benchmark_home_case_study_blocks: number | null;
  benchmark_home_article_blocks_home: number | null;
  benchmark_home_pdf_downloads_present: number | null;
  benchmark_home_performance_score: number | null;
  benchmark_home_accessibility_score: number | null;
  benchmark_home_seo_score: number | null;
  benchmark_home_best_practices_score: number | null;
  benchmark_product_url: string | null;
  benchmark_product_words_total: number | null;
  benchmark_product_video_blocks: number | null;
  benchmark_product_product_case_blocks: number | null;
  benchmark_product_product_has_video: number | null;
  benchmark_product_product_has_case_teaser: number | null;
  benchmark_product_product_has_download: number | null;
  benchmark_sitewide_sitewide_has_blog: number | null;
  benchmark_sitewide_sitewide_has_whitepapers: number | null;
  benchmark_sitewide_sitewide_has_webinars: number | null;
  benchmark_sitewide_sitewide_has_case_studies: number | null;
  benchmark_sitewide_sitewide_has_downloads: number | null;
};

export const BENCHMARK_COLUMNS = [
  "benchmark_company",
  "benchmark_url",
  "benchmark_match_strategy",
  "benchmark_home_words_total",
  "benchmark_home_modules_count",
  "benchmark_home_video_blocks",
  "benchmark_home_prominent_cta_present",
  "benchmark_home_newsletter_present",
  "benchmark_home_blog_present",
  "benchmark_home_resources_present",
  "benchmark_home_case_study_blocks",
  "benchmark_home_article_blocks_home",
  "benchmark_home_pdf_downloads_present",
  "benchmark_home_performance_score",
  "benchmark_home_accessibility_score",
  "benchmark_home_seo_score",
  "benchmark_home_best_practices_score",
  "benchmark_product_url",
  "benchmark_product_words_total",
  "benchmark_product_video_blocks",
  "benchmark_product_product_case_blocks",
  "benchmark_product_product_has_video",
  "benchmark_product_product_has_case_teaser",
  "benchmark_product_product_has_download",
  "benchmark_sitewide_sitewide_has_blog",
  "benchmark_sitewide_sitewide_has_whitepapers",
  "benchmark_sitewide_sitewide_has_webinars",
  "benchmark_sitewide_sitewide_has_case_studies",
  "benchmark_sitewide_sitewide_has_downloads",
] as const;

export const BENCHMARK_SELECT = `
  b."Id"            AS benchmark_id,
  b.vdma_company_id AS vdma_company_id,
  b.vdma_name       AS benchmark_vdma_name,
${BENCHMARK_COLUMNS.map((col) => `  b.${col} AS ${col}`).join(",\n")}
`;

// One benchmark per member: newest row wins.
export const BENCHMARK_LATEST_CTE = `
  SELECT DISTINCT ON (b.vdma_company_id) ${BENCHMARK_SELECT}
    FROM ${TABLE} b
   WHERE b.vdma_company_id IS NOT NULL
   ORDER BY b.vdma_company_id, b."Id" DESC
`;

export async function findByMemberId(id: number): Promise<BenchmarkRow | null> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query<BenchmarkRow>(
      `SELECT ${BENCHMARK_SELECT}
         FROM ${TABLE} b
        WHERE b.vdma_company_id = @id
        ORDER BY b."Id" DESC
        LIMIT 1;`,
    );

  return result.recordset[0] ?? null;
}
