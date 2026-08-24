/**
 * Official-website phone enrichment for all five supported industries.
 * Default is dry-run. Use --apply to update active_leads.
 */
import fs from "node:fs";

const INDUSTRIES = [
  "Automobile & Auto Components",
  "Pharmaceuticals & Healthcare Manufacturing",
  "Chemical Manufacturing & Allied Industries",
  "Packaging, Plastics & Paper Manufacturing",
  "Food Processing & Agro Manufacturing",
];
const BLOCKED_HOSTS = ["indiamart.com", "tradeindia.com", "justdial.com", "exportersindia.com", "facebook.com", "instagram.com", "linkedin.com", "page.link", "bit.ly", "tinyurl.com", "t.co", "goo.gl"];
const PHONE_PATTERN = /(?<!\d)(?:\+?91[\s.()/-]*)?(?:0?[6-9]\d{9}|0?[1-9]\d{7,10})(?!\d)/g;
const apply = process.argv.includes("--apply");
const limitIndex = process.argv.indexOf("--limit-per-industry");
const perIndustryLimit = limitIndex >= 0 ? Math.max(1, Number(process.argv[limitIndex + 1]) || 100) : 100;

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      if (!process.env[key.trim()]) process.env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function officialWebsite(url) {
  try {
    const parsed = new URL(url);
    const name = host(url);
    return ["http:", "https:"].includes(parsed.protocol) && name && !BLOCKED_HOSTS.some((domain) => name === domain || name.endsWith(`.${domain}`));
  } catch { return false; }
}
function normalizePhone(raw) {
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91 ${digits}`;
  if (digits.length >= 8 && digits.length <= 11) return `0${digits}`;
  return null;
}
function extractPhones(html) {
  const candidates = [...html.matchAll(/href\s*=\s*["']tel:([^"']+)/gi)].map((m) => m[1]);
  candidates.push(...(html.replace(/<[^>]*>/g, " ").match(PHONE_PATTERN) || []));
  return [...new Set(candidates.map(normalizePhone).filter(Boolean))];
}
async function loadPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { headers: { "user-agent": "LeadFlow official contact verifier" }, redirect: "follow", signal: controller.signal });
    if (!response.ok || host(response.url) !== host(url)) return null;
    return { url: response.url, html: await response.text() };
  } catch { return null; } finally { clearTimeout(timer); }
}
async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await fetch(url, options); } catch (error) { lastError = error; }
  }
  throw lastError;
}
function contactUrls(homeUrl, html) {
  const values = [];
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(regex)) {
    const label = `${match[1]} ${match[2].replace(/<[^>]*>/g, " ")}`.toLowerCase();
    if (!/(contact|contact-us|contactus|reach-us|get-in-touch|connect)/.test(label)) continue;
    try {
      const candidate = new URL(match[1], homeUrl).toString();
      if (host(candidate) === host(homeUrl)) values.push(candidate);
    } catch { /* ignore malformed URL */ }
  }
  return [...new Set(values)].slice(0, 2);
}
async function websitePhones(url) {
  const homepage = await loadPage(url);
  if (!homepage) return [];
  const numbers = extractPhones(homepage.html);
  for (const contactUrl of contactUrls(homepage.url, homepage.html)) {
    const contactPage = await loadPage(contactUrl);
    if (contactPage) numbers.push(...extractPhones(contactPage.html));
  }
  return [...new Set(numbers)];
}

loadEnv();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase environment variables.");
const apiUrl = `${supabaseUrl}/rest/v1/active_leads`;
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

let scanned = 0;
let candidates = 0;
let updated = 0;
for (const industry of INDUSTRIES) {
  const query = new URLSearchParams({ select: "id,company_name,industry,phone,website", industry: `eq.${industry}`, limit: String(perIndustryLimit) });
  const response = await fetchWithRetry(`${apiUrl}?${query}`, { headers });
  if (!response.ok) throw new Error(`Supabase read failed for ${industry}: ${response.status}`);
  const leads = await response.json();
  for (const lead of leads) {
    scanned += 1;
    if (!officialWebsite(lead.website)) continue;
    const numbers = await websitePhones(lead.website);
    const existing = normalizePhone(lead.phone);
    const websitePhone = numbers.includes(existing) ? existing : numbers.find((number) => number.startsWith("+91 ")) || numbers[0];
    if (!websitePhone || websitePhone === existing) continue;
    candidates += 1;
    console.log(`${apply ? "UPDATE" : "WOULD UPDATE"} | ${lead.company_name} | ${lead.phone || "N/A"} -> ${websitePhone}`);
    if (!apply) continue;
    const digits = websitePhone.replace(/\D/g, "").replace(/^91/, "");
    const mobile = /^[6-9]\d{9}$/.test(digits);
    const patch = await fetchWithRetry(`${apiUrl}?id=eq.${encodeURIComponent(lead.id)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ phone: websitePhone, phone_type: mobile ? "Mobile" : "Landline", is_whatsapp: mobile, whatsapp_link: mobile ? `https://wa.me/91${digits}` : null }),
    });
    if (!patch.ok) throw new Error(`Update failed for ${lead.company_name}: ${patch.status}`);
    updated += 1;
  }
}
console.log(apply
  ? `Updated ${updated} of ${candidates} verified candidates after scanning ${scanned} leads.`
  : `Dry-run found ${candidates} verified candidates after scanning ${scanned} leads.`);
