import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const pageSizeLimit = 50;
type WorksheetRow = {
  id: string;
  title: string;
  subject: string;
  class_name: string;
  level: string;
  topic: string | null;
  description: string | null;
  pdf_url: string;
  thumbnail_url: string | null;
  published_date: string;
  featured: boolean;
};

const normalizeClass = (value: string | null) => {
  const compact = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const match = compact.match(/^(class|grade)(\d+)$/);
  return match ? `class-${Number(match[2])}` : compact;
};

const classValue = (value: string | null) => {
  const compact = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const match = compact.match(/^(class|grade)(\d+)$/);
  return match ? `Class ${Number(match[2])}` : String(value || "").trim();
};

const unique = (values: (string | null)[]) => [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
const uniqueClasses = (values: (string | null)[]) => {
  const classes = new Map<string, string>();
  values.forEach(value => {
    const key = normalizeClass(value);
    if (key && !classes.has(key)) classes.set(key, classValue(value));
  });
  return [...classes.values()].sort((a, b) => a.localeCompare(b));
};

const worksheet = (row: WorksheetRow) => ({
  id: row.id,
  title: row.title,
  subject: row.subject,
  className: classValue(row.class_name),
  level: row.level,
  topic: row.topic,
  description: row.description,
  pdfUrl: row.pdf_url,
  thumbnailUrl: row.thumbnail_url,
  featured: row.featured,
  isNew: Date.now() - new Date(row.published_date).getTime() < 12096e5,
  isFree: true,
});

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Number(query.get("page")) || 1);
  const pageSize = Math.min(pageSizeLimit, Math.max(1, Number(query.get("pageSize")) || 9));
  const sort = query.get("sort") === "alphabetical" ? "alphabetical" : "newest";
  if (query.get("facets") === "true") {
    const { data, error } = await client.from("worksheets").select("class_name,subject,level").eq("status", "Published");
    if (error) return json({ error: "Could not load worksheet filters" }, 500);
    return json({
      classes: uniqueClasses((data || []).map(row => row.class_name)),
      subjects: unique((data || []).map(row => row.subject)),
      levels: unique((data || []).map(row => row.level)),
    }, 200, { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1200" });
  }
  const classFilter = query.get("class");
  let builder = client.from("worksheets").select("id,title,subject,class_name,level,topic,description,pdf_url,thumbnail_url,published_date,featured", { count: "exact" }).eq("status", "Published");
  if (query.get("subject")) builder = builder.eq("subject", query.get("subject")!);
  if (query.get("level")) builder = builder.eq("level", query.get("level")!);
  if (query.get("featured") === "true") builder = builder.eq("featured", true);
  builder = sort === "alphabetical" ? builder.order("title", { ascending: true }).order("id", { ascending: true }) : builder.order("published_date", { ascending: false }).order("id", { ascending: false });
  if (classFilter) {
    const { data, error } = await builder;
    if (error) return json({ error: "Could not load worksheets" }, 500);
    const classKey = normalizeClass(classFilter);
    const rows = ((data || []) as WorksheetRow[]).filter(row => normalizeClass(row.class_name) === classKey);
    const total = rows.length;
    return json({
      worksheets: rows.slice((page - 1) * pageSize, page * pageSize).map(worksheet),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    }, 200, { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" });
  }
  const { data, error, count } = await builder.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return json({ error: "Could not load worksheets" }, 500);
  const total = count || 0;
  return json({
    worksheets: ((data || []) as WorksheetRow[]).map(worksheet),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  }, 200, { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" });
});
