// ip.jaba.ge: shows the visitor's public IP address and what Cloudflare knows
// about the connection.
//
//   GET /            browsers get the page; curl, wget and friends get the bare IP
//   GET /ip          the bare IP, for any client
//   GET /json        everything as JSON
//   GET /all         everything as aligned text, for terminals
//   GET /country, /city, /region, /postal, /loc, /tz, /asn, /org, /colo,
//       /hostname, /ua   one field as plain text
//
// Static files (font, favicon) are served from ./public by Workers Assets.

import PAGE from "./page.html";

const PTR_TIMEOUT_MS = 800;

const COLOS = {
  TBS: "Tbilisi", EVN: "Yerevan", GYD: "Baku", IST: "Istanbul", ESB: "Ankara", ADB: "Izmir",
  FRA: "Frankfurt", MUC: "Munich", BER: "Berlin", HAM: "Hamburg", DUS: "Düsseldorf", VIE: "Vienna", AMS: "Amsterdam",
  LHR: "London", MAN: "Manchester", CDG: "Paris", MRS: "Marseille", MXP: "Milan", FCO: "Rome",
  MAD: "Madrid", BCN: "Barcelona", LIS: "Lisbon", ZRH: "Zurich", GVA: "Geneva", BRU: "Brussels", PRG: "Prague",
  WAW: "Warsaw", BUD: "Budapest", OTP: "Bucharest", SOF: "Sofia", ATH: "Athens", KBP: "Kyiv", KIV: "Chișinău",
  ARN: "Stockholm", CPH: "Copenhagen", OSL: "Oslo", HEL: "Helsinki", DXB: "Dubai", DOH: "Doha", TLV: "Tel Aviv",
  JFK: "New York", EWR: "Newark", IAD: "Ashburn", ORD: "Chicago", DFW: "Dallas", LAX: "Los Angeles",
  SJC: "San Jose", SEA: "Seattle", MIA: "Miami", ATL: "Atlanta", YYZ: "Toronto",
  SIN: "Singapore", HKG: "Hong Kong", NRT: "Tokyo", ICN: "Seoul", BOM: "Mumbai", DEL: "Delhi", SYD: "Sydney",
};

let regionNames;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch {}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const browser = isBrowser(request);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text("Method not allowed\n", 405, { Allow: "GET, HEAD" });
    }

    // Browsers on plain HTTP go to HTTPS. Terminals don't, so `curl ip.jaba.ge`
    // answers directly instead of printing a redirect.
    if (url.protocol === "http:" && browser) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";
    const d = collect(request);

    switch (path) {
      case "/":
        return browser ? page(d) : text(d.ip + "\n");
      case "/ip":
        return text(d.ip + "\n");
      case "/json": {
        d.hostname = await reverseDns(d.ip);
        return new Response(JSON.stringify(d, null, 2) + "\n", {
          headers: { "Content-Type": "application/json; charset=utf-8", ...common(), ...cors() },
        });
      }
      case "/all": {
        d.hostname = await reverseDns(d.ip);
        return text(table(d));
      }
      case "/hostname": {
        const h = await reverseDns(d.ip);
        return text((h || "") + "\n", h ? 200 : 404);
      }
      case "/country": return field(d.country);
      case "/city": return field(d.city);
      case "/region": return field(d.region);
      case "/postal": return field(d.postal);
      case "/loc": return field(d.latitude != null ? d.latitude + "," + d.longitude : null);
      case "/tz":
      case "/timezone": return field(d.timezone);
      case "/asn": return field(d.asn ? "AS" + d.asn : null);
      case "/org":
      case "/isp": return field(d.org);
      case "/colo": return field(d.colo);
      case "/ua": return field(d.user_agent);
      default:
        return text("Not found. Try /, /ip, /json or /all\n", 404);
    }
  },
};

// A browser asks for HTML. curl, wget, HTTPie and PowerShell don't.
function isBrowser(request) {
  const accept = request.headers.get("Accept") || "";
  const ua = request.headers.get("User-Agent") || "";
  if (/PowerShell/i.test(ua)) return false;
  return accept.includes("text/html");
}

function collect(request) {
  const cf = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
  let countryName = null;
  try { if (cf.country && regionNames) countryName = regionNames.of(cf.country); } catch {}
  return {
    ip,
    version: ip.includes(":") ? 6 : 4,
    hostname: null,
    city: cf.city || null,
    region: cf.region || null,
    region_code: cf.regionCode || null,
    postal: cf.postalCode || null,
    country: cf.country || null,
    country_name: countryName,
    continent: cf.continent || null,
    eu: cf.isEUCountry === "1",
    latitude: num(cf.latitude),
    longitude: num(cf.longitude),
    timezone: cf.timezone || null,
    asn: cf.asn || null,
    org: cf.asOrganization || null,
    colo: cf.colo || null,
    colo_city: COLOS[cf.colo] || null,
    http: cf.httpProtocol || null,
    tls: cf.tlsVersion || null,
    rtt_ms: num(cf.clientTcpRtt) || null,
    user_agent: request.headers.get("User-Agent") || null,
  };
}

// PTR lookup over Cloudflare's DNS-over-HTTPS, with a short timeout so a slow
// resolver never holds up the answer.
async function reverseDns(ip) {
  const name = arpaName(ip);
  if (!name) return null;
  try {
    const r = await fetch("https://cloudflare-dns.com/dns-query?type=PTR&name=" + encodeURIComponent(name), {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(PTR_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const ans = (j.Answer || []).find((a) => a.type === 12);
    return ans ? ans.data.replace(/\.$/, "") : null;
  } catch {
    return null;
  }
}

function arpaName(ip) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").reverse().join(".") + ".in-addr.arpa";
  if (!ip.includes(":")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0")).join("").toLowerCase().split("").reverse().join(".") + ".ip6.arpa";
}

function table(d) {
  const place = [d.city, d.region !== d.city ? d.region : null, d.country_name || d.country].filter(Boolean).join(", ");
  const conn = [d.http, d.tls, d.rtt_ms ? d.rtt_ms + " ms RTT" : null].filter(Boolean).join(", ");
  const rows = [
    ["IP", d.ip],
    ["Version", "IPv" + d.version],
    ["Hostname", d.hostname],
    ["Location", place + (d.postal ? " " + d.postal : "")],
    ["Coordinates", d.latitude != null ? d.latitude + ", " + d.longitude : null],
    ["Timezone", d.timezone],
    ["Network", [d.asn ? "AS" + d.asn : null, d.org].filter(Boolean).join(" ")],
    ["Cloudflare", d.colo ? (d.colo_city ? d.colo_city + " (" + d.colo + ")" : d.colo) : null],
    ["Connection", conn],
  ];
  return "\n  ip.jaba.ge\n\n" +
    rows.filter(([, v]) => v).map(([k, v]) => "  " + k.padEnd(13) + v).join("\n") +
    "\n\n  Speed test: curl https://speed.jaba.ge\n\n";
}

function page(d) {
  const data = JSON.stringify(d).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");
  const html = PAGE
    .replace("__DATA__", () => data)
    .replace(/__IP__/g, () => escapeHtml(d.ip));
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      ...common(),
    },
  });
}

function field(v) {
  return v == null || v === "" ? text("\n", 404) : text(v + "\n");
}

function text(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...common(), ...cors(), ...extra },
  });
}

function common() {
  return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Accept, User-Agent" };
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
