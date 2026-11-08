// Vercel Serverless / Edge Function for High-Accuracy Instant Visitor Country Detection
// Uses Vercel Edge / Cloudflare geo headers without external API rate limits or delays

export default function handler(req, res) {
    // 1. Vercel GeoIP Headers
    const vercelCountry = req.headers['x-vercel-ip-country'];
    const vercelCity = req.headers['x-vercel-ip-city'];
    const vercelRegion = req.headers['x-vercel-ip-country-region'];

    // 2. Cloudflare GeoIP Header (if proxied via Cloudflare)
    const cfCountry = req.headers['cf-ipcountry'];

    // 3. Fallback Header (Standard X-Country-Code)
    const headerCountry = req.headers['x-country-code'];

    const rawCountry = vercelCountry || cfCountry || headerCountry || null;
    const cleanCountry = (rawCountry && /^[A-Za-z]{2}$/.test(rawCountry.trim()))
        ? rawCountry.trim().toUpperCase()
        : null;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    return res.status(200).json({
        success: true,
        country: cleanCountry,
        city: vercelCity ? decodeURIComponent(vercelCity) : null,
        region: vercelRegion || null,
        detectedVia: vercelCountry ? 'vercel_edge' : (cfCountry ? 'cloudflare' : 'fallback')
    });
}
