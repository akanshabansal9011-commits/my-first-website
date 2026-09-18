import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

type SheetRow = Record<string, string>;
const requiredHeaders = ["ID", "Title", "Subject", "Class", "Level", "Topic", "Description", "PDF URL", "Thumbnail URL", "Published Date", "Status", "Featured", "Tags"];
const statuses = new Set(["Draft", "Published", "Archived"]);
const levels = new Set(["Easy", "Medium", "Hard"]);
const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const titleCase = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "";
const normalizeStatus = (value: string) => titleCase(value.trim());
const normalizeLevel = (value: string) => titleCase(value.trim());
const normalizeClass = (value: string) => {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "");
  const match = compact.match(/^(class|grade)(\d+)$/);
  return match ? `Class ${Number(match[2])}` : value.trim();
};
const normalizeFeatured = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
};

const b64url = (value: string) => btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
async function accessToken() {
  const account = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "{}");
  if (!account.client_email || !account.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  const now = Math.floor(Date.now() / 1000);
  const claim = b64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const input = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${claim}`;
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const bytes = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)));
  const assertion = `${input}.${b64url(String.fromCharCode(...signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error(`Google authentication failed: ${await response.text()}`);
  return (await response.json()).access_token as string;
}

function validUrl(value: string, required = true) { try { const url = new URL(value); return (!required && !value) || ["https:", "http:"].includes(url.protocol); } catch { return !required && !value; } }
function toRow(headers: string[], values: unknown[]): SheetRow { return Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])); }
function validate(row: SheetRow) {
  const errors: string[] = [];
  requiredHeaders.forEach(header => { if (!row[header] && !["Topic", "Description", "Thumbnail URL", "Tags"].includes(header)) errors.push(`${header} is required`); });
  if (row["ID"] && !/^[A-Za-z0-9_-]+$/.test(row["ID"])) errors.push("ID may contain only letters, numbers, hyphens, and underscores");
  if (row["Subject"] && row["Subject"].length > 80) errors.push("Subject is too long");
  if (row["Class"] && row["Class"].length > 80) errors.push("Class is too long");
  if (row["Level"] && !levels.has(normalizeLevel(row["Level"]))) errors.push("Level must be Easy, Medium, or Hard");
  if (row["Status"] && !statuses.has(normalizeStatus(row["Status"]))) errors.push("Status must be Draft, Published, or Archived");
  if (row["PDF URL"] && !validUrl(row["PDF URL"])) errors.push("PDF URL must be a valid http(s) URL");
  if (!validUrl(row["Thumbnail URL"], false)) errors.push("Thumbnail URL must be a valid http(s) URL");
  if (row["Published Date"] && Number.isNaN(Date.parse(row["Published Date"]))) errors.push("Published Date is invalid");
  if (row["Featured"] && normalizeFeatured(row["Featured"]) === null) errors.push("Featured must be TRUE/FALSE or Yes/No");
  return errors;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!Deno.env.get("SYNC_SECRET") || request.headers.get("x-sync-secret") !== Deno.env.get("SYNC_SECRET")) return json({ error: "Unauthorized" }, 401);
  const { data: log } = await client.from("worksheet_sync_logs").insert({ status: "running" }).select("id").single();
  const errors: { row: number; id?: string; errors: string[] }[] = [];
  try {
    const token = await accessToken();
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    const tab = Deno.env.get("GOOGLE_SHEET_TAB") || "Worksheets";
    if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not configured");
    const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${tab}!A:M`)}?valueRenderOption=FORMATTED_VALUE`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Sheets read failed: ${await response.text()}`);
    const values = (await response.json()).values || [];
    const headers = (values.shift() || []).map((header: unknown) => String(header).trim());
    const missing = requiredHeaders.filter(header => !headers.includes(header));
    if (missing.length) throw new Error(`Sheet is missing required columns: ${missing.join(", ")}`);
    const rows = values.filter((row: unknown[]) => row.some(value => String(value).trim())).map((row: unknown[]) => toRow(headers, row));
    const incomingIds = new Set<string>();
    const valid = [];
    rows.forEach((row, index) => { if (row.ID) incomingIds.add(row.ID); const rowErrors = validate(row); if (rowErrors.length) errors.push({ row: index + 2, id: row.ID, errors: rowErrors }); else valid.push({ id: row.ID, title: row.Title, subject: row.Subject, class_name: normalizeClass(row.Class), level: normalizeLevel(row.Level), topic: row.Topic || null, description: row.Description || null, pdf_url: row["PDF URL"], thumbnail_url: row["Thumbnail URL"] || null, published_date: new Date(row["Published Date"]).toISOString().slice(0, 10), status: normalizeStatus(row.Status), featured: normalizeFeatured(row.Featured) === true, tags: row.Tags ? row.Tags.split(",").map(tag => tag.trim()).filter(Boolean) : [], source: "google-sheets", source_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }); });
    if (valid.length) { const { error } = await client.from("worksheets").upsert(valid, { onConflict: "id" }); if (error) throw error; }
    const { data: existing } = await client.from("worksheets").select("id").eq("source", "google-sheets").neq("status", "Archived");
    const removedIds = (existing || []).map(row => row.id).filter(id => !incomingIds.has(id));
    if (removedIds.length) await client.from("worksheets").update({ status: "Archived", updated_at: new Date().toISOString() }).in("id", removedIds);
    const status = errors.length ? "partial" : "success";
    await client.from("worksheet_sync_logs").update({ status, finished_at: new Date().toISOString(), processed_count: rows.length, inserted_or_updated_count: valid.length, archived_count: removedIds.length, error_count: errors.length, errors }).eq("id", log?.id);
    return json({ status, processed: rows.length, upserted: valid.length, archived: removedIds.length, errors });
  } catch (error) {
    await client.from("worksheet_sync_logs").update({ status: "failed", finished_at: new Date().toISOString(), error_count: errors.length + 1, errors: [...errors, { row: 0, errors: [error instanceof Error ? error.message : "Unknown error"] }] }).eq("id", log?.id);
    return json({ error: "Sync failed", detail: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
