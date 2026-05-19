// /api/contact.js — Vercel serverless function
// Receives the website contact form and pushes it into GoHighLevel as a
// new Contact (plus a tag) using the LeadConnector Contacts API.
//
// Env vars expected at runtime (set in Vercel project settings or .env):
//   GHL_API_TOKEN     — Private Integration token (Bearer)
//   GHL_LOCATION_ID   — the location/sub-account id
//   GHL_API_VERSION   — optional, defaults to 2021-07-28
//   GHL_TAG           — optional, defaults to "website-enquiry"

export default async function handler(req, res) {
  // CORS / method guard
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { GHL_API_TOKEN, GHL_LOCATION_ID } = process.env;
  const apiVersion = process.env.GHL_API_VERSION || "2021-07-28";
  const tag = process.env.GHL_TAG || "website-enquiry";

  if (!GHL_API_TOKEN || !GHL_LOCATION_ID) {
    return res.status(500).json({
      ok: false,
      error: "GHL is not configured on the server. Missing GHL_API_TOKEN or GHL_LOCATION_ID."
    });
  }

  // Vercel parses JSON automatically when Content-Type is application/json
  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});

  // Honeypot — silently accept and drop
  if (body.website && String(body.website).trim() !== "") {
    return res.status(200).json({ ok: true, dropped: true });
  }

  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  const companyName = clean(body.companyName);
  const interest = clean(body.interest);
  const message = clean(body.message);

  if (!firstName) return res.status(400).json({ ok: false, error: "First name is required." });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "A valid email is required." });
  }

  const payload = {
    locationId: GHL_LOCATION_ID,
    firstName,
    lastName: lastName || undefined,
    name: [firstName, lastName].filter(Boolean).join(" ") || undefined,
    email,
    phone: phone || undefined,
    companyName: companyName || undefined,
    source: "Jack in the Box Training — website",
    tags: [tag, interest ? `interest:${slug(interest)}` : null].filter(Boolean),
  };

  const ghlHeaders = {
    "Authorization": `Bearer ${GHL_API_TOKEN}`,
    "Version": apiVersion,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  try {
    const ghlRes = await fetch("https://services.leadconnectorhq.com/contacts/", {
      method: "POST",
      headers: ghlHeaders,
      body: JSON.stringify(payload),
    });

    const data = await ghlRes.json().catch(() => ({}));

    let contactId = data?.contact?.id || null;
    let duplicate = false;

    if (!ghlRes.ok) {
      // 400 duplicate is acceptable — recover the existing contact id and continue
      const isDuplicate =
        ghlRes.status === 400 &&
        (data?.message || "").toLowerCase().includes("duplicate");
      if (!isDuplicate) {
        return res.status(502).json({
          ok: false,
          error: data?.message || `GHL responded ${ghlRes.status}.`,
          details: data,
        });
      }
      duplicate = true;
      contactId =
        data?.meta?.contactId ||
        data?.contactId ||
        data?.contact?.id ||
        null;
    }

    // Attach the enquiry as a Note on the contact (programme + message + meta).
    let noteOk = true;
    let noteError = null;
    if (contactId && (interest || message || companyName || phone)) {
      const noteBody = buildNoteBody({
        firstName,
        lastName,
        email,
        phone,
        companyName,
        interest,
        message,
      });
      const noteRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/notes`,
        {
          method: "POST",
          headers: ghlHeaders,
          body: JSON.stringify({ body: noteBody }),
        }
      );
      if (!noteRes.ok) {
        noteOk = false;
        const noteData = await noteRes.json().catch(() => ({}));
        noteError = noteData?.message || `Note API responded ${noteRes.status}.`;
      }
    }

    return res.status(200).json({
      ok: true,
      contactId,
      duplicate,
      noteOk,
      ...(noteError ? { noteError } : {}),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Could not reach GHL — please try again or email us.",
      detail: err.message,
    });
  }
}

function buildNoteBody({ firstName, lastName, email, phone, companyName, interest, message }) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const lines = [
    "Website enquiry — Jack in the Box Training",
    `Received: ${ts}`,
    "",
    `Name:      ${[firstName, lastName].filter(Boolean).join(" ") || "—"}`,
    `Email:     ${email || "—"}`,
    `Phone:     ${phone || "—"}`,
    `Business:  ${companyName || "—"}`,
    "",
    "Programme of interest:",
    interest ? `  ${interest}` : "  (not specified)",
    "",
    "About the business:",
    message ? message.split(/\r?\n/).map((l) => `  ${l}`).join("\n") : "  (no message provided)",
  ];
  return lines.join("\n");
}

function clean(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, 1000);
}
function slug(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
