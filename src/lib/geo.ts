import { Request } from "express";

export interface GeoLocation {
  country: string;
  countryCode: string;
  city: string;
  region: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
}

export interface ClientInfo {
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  geo: GeoLocation;
}

// In-memory cache for IP geo lookups
const geoCache = new Map<string, GeoLocation>();

/**
 * Extracts the real client IP from Express request, taking reverse proxies into account.
 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstIp = raw.split(",")[0].trim();
    if (firstIp && isValidIp(firstIp)) {
      return cleanIp(firstIp);
    }
  }

  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string" && isValidIp(cfIp)) {
    return cleanIp(cfIp);
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp && typeof realIp === "string" && isValidIp(realIp)) {
    return cleanIp(realIp);
  }

  const socketIp = req.socket?.remoteAddress;
  if (socketIp && isValidIp(socketIp)) {
    return cleanIp(socketIp);
  }

  return "127.0.0.1";
}

function cleanIp(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.replace("::ffff:", "");
  }
  return ip;
}

function isValidIp(ip: string): boolean {
  if (!ip) return false;
  return ip.length >= 7 && ip.length <= 45;
}

function isPrivateIp(ip: string): boolean {
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.3") ||
    ip.startsWith("fe80:")
  ) {
    return true;
  }
  return false;
}

/**
 * Resolves IP geolocation via headers or fast cached ip-api lookup.
 */
export async function resolveGeoLocation(ip: string, req?: Request): Promise<GeoLocation> {
  // 1. Check if headers provide country directly (Cloudflare / Vercel / Nginx)
  if (req) {
    const cfCountry = req.headers["cf-ipcountry"];
    const cfCity = req.headers["cf-ipcity"];
    if (cfCountry && typeof cfCountry === "string" && cfCountry !== "XX") {
      return {
        country: getCountryName(cfCountry),
        countryCode: cfCountry.toUpperCase(),
        city: (typeof cfCity === "string" ? cfCity : "Unknown City"),
        region: "",
      };
    }
  }

  // 2. If private / local IP
  if (isPrivateIp(ip)) {
    return {
      country: "Local Network",
      countryCode: "PS", // Palestine flag branding for local developer
      city: "Developer Workspace",
      region: "Localhost",
      isp: "Private Intranet",
    };
  }

  // 3. Check in-memory cache
  if (geoCache.has(ip)) {
    return geoCache.get(ip)!;
  }

  // 4. Fast external lookup with 1.8s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp`, {
      signal: controller.signal,
      headers: { "User-Agent": "SkillPS-Telemetry/1.0" },
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (data.status === "success") {
        const geo: GeoLocation = {
          country: data.country || "Unknown Country",
          countryCode: data.countryCode || "UN",
          city: data.city || "Unknown City",
          region: data.regionName || "",
          latitude: typeof data.lat === "number" ? data.lat : undefined,
          longitude: typeof data.lon === "number" ? data.lon : undefined,
          isp: data.isp || "Unknown ISP",
        };
        geoCache.set(ip, geo);
        return geo;
      }
    }
  } catch {
    // Fall through to fallback
  }

  const fallback: GeoLocation = {
    country: "Unknown Country",
    countryCode: "UN",
    city: "Unknown City",
    region: "",
    isp: "Network Provider",
  };
  geoCache.set(ip, fallback);
  return fallback;
}

/**
 * Lightweight User-Agent parser for OS, Browser, and Device.
 */
export function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  if (!ua) {
    return { browser: "Skills CLI", os: "Terminal", device: "CLI" };
  }

  const lower = ua.toLowerCase();

  // OS
  let os = "Unknown OS";
  if (lower.includes("macintosh") || lower.includes("mac os")) os = "macOS";
  else if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ipod")) os = "iOS";
  else if (lower.includes("linux")) os = "Linux";
  else if (lower.includes("curl") || lower.includes("node") || lower.includes("skills")) os = "CLI / Terminal";

  // Browser
  let browser = "Browser";
  if (lower.includes("edg/")) browser = "Microsoft Edge";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "Opera";
  else if (lower.includes("brave")) browser = "Brave";
  else if (lower.includes("chrome") && !lower.includes("edg/")) browser = "Google Chrome";
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Apple Safari";
  else if (lower.includes("firefox")) browser = "Mozilla Firefox";
  else if (lower.includes("curl")) browser = "cURL";
  else if (lower.includes("skills")) browser = "Skills CLI";
  else if (lower.includes("axios") || lower.includes("node-fetch")) browser = "Node.js Client";

  // Device
  let device = "Desktop";
  if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) device = "Mobile";
  else if (lower.includes("ipad") || lower.includes("tablet")) device = "Tablet";
  else if (lower.includes("curl") || lower.includes("skills") || lower.includes("node")) device = "CLI";

  return { browser, os, device };
}

function getCountryName(code: string): string {
  const map: Record<string, string> = {
    PS: "Palestine",
    SA: "Saudi Arabia",
    JO: "Jordan",
    EG: "Egypt",
    AE: "United Arab Emirates",
    QA: "Qatar",
    KW: "Kuwait",
    OM: "Oman",
    BH: "Bahrain",
    US: "United States",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    CA: "Canada",
    TR: "Turkey",
  };
  return map[code.toUpperCase()] || code;
}
