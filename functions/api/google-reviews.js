// Cloudflare Pages Function — proxies Google Places API "Place Details" so the
// real API key stays server-side and never reaches the browser.
// Route: /api/google-reviews?lang=uk|ru
//
// Requires a Cloudflare Pages environment variable named GOOGLE_PLACES_API_KEY
// (Pages project → Settings → Environment variables). Do not hardcode the key here.

const PLACE_ID = "ChIJUWnIZzwB6I8RSi2OgfAfuWI";
// Matches the HTTP-referrer restriction already set on the API key in Google Cloud.
const SITE_ORIGIN = "https://keysos.kiev.ua/";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "ru" ? "ru" : "uk";

  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing_api_key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const googleUrl = `https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=${lang}`;

  let googleRes;
  try {
    googleRes = await fetch(googleUrl, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "rating,userRatingCount,reviews",
        "Referer": SITE_ORIGIN,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!googleRes.ok) {
    return new Response(JSON.stringify({ error: "places_api_error", status: googleRes.status }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await googleRes.json();

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Edge-cache so most visitors never trigger a fresh Google API call.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
