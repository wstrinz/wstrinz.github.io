const params = new URLSearchParams(window.location.search);
const DEFAULT_PARTY = "Democratic";
const dimensionLabels = [
  ["hope_story", "Hope"],
  ["material_specificity", "Material"],
  ["authentic_longform", "Longform"],
  ["problem_clarity", "Problem"],
  ["fight_selection", "Fights"]
];

const slugify = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));
const fmt = value => value == null ? "n/a" : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;
const fmtVibe = value => value == null ? "n/a" : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}/4`;
const fmtShare = value => value == null ? "pending" : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;
const pct = value => value == null ? "0%" : `${Math.max(1.5, Math.min(100, Number(value) / 40 * 100))}%`;
const vibePct = value => `${Math.max(0, Math.min(100, Number(value || 0) / 4 * 100))}%`;
const fullPct = value => `${Math.max(0, Math.min(100, Number(value || 0)))}%`;

function normalizeRow(row) {
  const normalized = Array.isArray(row)
    ? {
        tier: row[0],
        entity: row[1],
        market_display: row[2],
        market_low: row[3],
        market_high: row[4],
        poll_display: row[5],
        poll_low: row[6],
        poll_high: row[7],
        note: row[8]
      }
    : { ...row };
  normalized.party = normalized.party || DEFAULT_PARTY;
  normalized.market_midpoint = normalized.market_midpoint ?? (normalized.market_low == null || normalized.market_high == null ? null : (Number(normalized.market_low) + Number(normalized.market_high)) / 2);
  normalized.poll_midpoint = normalized.poll_midpoint ?? (normalized.poll_low == null || normalized.poll_high == null ? null : (Number(normalized.poll_low) + Number(normalized.poll_high)) / 2);
  normalized.trump_endorsement_chance = normalized.trump_endorsement_chance == null ? null : Number(normalized.trump_endorsement_chance);
  return normalized;
}

function weightProfile(snapshot) {
  const model = snapshot.vibes_model || {};
  const profiles = model.weight_profiles || {};
  const requested = params.get("weight_profile");
  const key = profiles[requested] ? requested : snapshot.weight_profile || model.default_weight_profile || "hope_cycle";
  return {
    key,
    label: profiles[key]?.label || key.replace(/_/g, " "),
    weights: profiles[key]?.weights || model.weights || snapshot.vibes_weight_profiles?.[key] || snapshot.vibes_weight_profiles?.hope_cycle || {}
  };
}

function deriveVibes(row, weights) {
  if (!row.vibes_dimensions) return row.vibes_score ?? null;
  let weighted = 0;
  let total = 0;
  Object.entries(weights).forEach(([key, weight]) => {
    const value = Number(row.vibes_dimensions[key]);
    if (Number.isFinite(value)) {
      weighted += value * weight;
      total += weight;
    }
  });
  return total ? Math.round((weighted / total) * 10) / 10 : null;
}

function countTotal(counts = {}) {
  const values = ["good", "bad", "neutral", "unclear"]
    .map(key => counts[key])
    .filter(value => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function hydrateRow(row, profile) {
  row.vibes_score = deriveVibes(row, profile.weights);
  const signal = row.mention_signal || {};
  const current = signal.current || signal.counts || {};
  const previous = signal.previous || {};
  const volume = Number.isFinite(Number(signal.volume)) ? Number(signal.volume) : countTotal(current);
  const previousVolume = Number.isFinite(Number(signal.previous_volume)) ? Number(signal.previous_volume) : countTotal(previous);
  const good = Number(current.good);
  const previousGood = Number(previous.good);
  row.mention_volume = volume;
  row.mention_volume_delta = volume == null || previousVolume == null ? null : volume - previousVolume;
  row.good_mention_share = Number.isFinite(Number(signal.good_share))
    ? Number(signal.good_share)
    : Number.isFinite(good) && volume ? Math.round((good / volume) * 1000) / 10 : null;
  const previousGoodShare = Number.isFinite(Number(signal.previous_good_share))
    ? Number(signal.previous_good_share)
    : Number.isFinite(previousGood) && previousVolume ? Math.round((previousGood / previousVolume) * 1000) / 10 : null;
  row.good_mention_share_delta = row.good_mention_share == null || previousGoodShare == null ? null : Math.round((row.good_mention_share - previousGoodShare) * 10) / 10;
  row.bad_mention_share = volume ? Math.round((Number(current.bad || 0) / volume) * 1000) / 10 : null;
  row.mention_confidence = signal.confidence || (volume == null ? "pending" : volume >= 20 ? "medium" : "low");
  row.mention_note = signal.note && signal.note !== "Manual mention capture pending."
    ? signal.note
    : row.mention_test_seed
      ? "Priority mention-test seed. Capture this row first when weekly manual rounds begin."
      : "Manual mention capture pending. Add counts and refs when a week is sampled.";
  return row;
}

function metricCard(label, value, className, width, title) {
  return `
    <article class="metric">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
      <div class="track" title="${escapeHtml(title || label)}"><i class="fill ${className}" style="--w:${width}"></i></div>
    </article>
  `;
}

function subscoreRows(row, snapshot, profile) {
  const dimensions = row.vibes_dimensions || {};
  const definitions = snapshot.vibes_model?.dimensions || snapshot.vibes_check?.dimensions || {};
  return dimensionLabels.map(([key, label]) => {
    const value = dimensions[key];
    const weight = profile.weights[key] || 1;
    return `
      <div class="subscore" title="${escapeHtml(definitions[key] || "")} Weight: ${weight}x in ${profile.label}.">
        <div class="subscore-head">
          <span>${escapeHtml(label)}</span>
          <span>${escapeHtml(value ?? "?")}/4 · ${escapeHtml(weight)}x</span>
        </div>
        <div class="track"><i class="fill vibes ${value == null ? "unknown" : ""}" style="--w:${value == null ? "0%" : vibePct(value)}"></i></div>
      </div>
    `;
  }).join("");
}

function historyRows(history, candidateName, profile) {
  const rows = history
    .map(snapshot => {
      const row = (snapshot.rows || []).map(normalizeRow).find(item => item.entity === candidateName);
      return row ? { ...hydrateRow(row, profile), captured_at: snapshot.captured_at } : null;
    })
    .filter(Boolean);
  if (!rows.length) return `<p class="empty">No historical values available yet.</p>`;
  const max = Math.max(10, ...rows.map(row => row.market_midpoint || 0));
  return rows.map(row => `
    <div class="baseline-row">
      <span>${escapeHtml(new Date(row.captured_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric" }) || "snapshot")}</span>
      <div class="track"><i class="fill market" style="--w:${row.market_midpoint == null ? "0%" : `${Math.min(100, row.market_midpoint / max * 100)}%`}"></i></div>
      <strong>${escapeHtml(row.market_display)}</strong>
    </div>
  `).join("");
}

function render(snapshot, history) {
  const slug = document.body.dataset.candidateSlug || slugify(location.pathname.split("/").filter(Boolean).pop() || "");
  const profile = weightProfile(snapshot);
  const rows = snapshot.rows.map(normalizeRow).map(row => hydrateRow(row, profile));
  const row = rows.find(candidate => slugify(candidate.entity) === slug);
  const app = document.getElementById("app");
  if (!row) {
    document.title = "Candidate Not Found";
    app.innerHTML = `
      <div class="wrap">
        <a class="back" href="../../">Back to dashboard</a>
        <header><div><p class="kicker">Candidate detail</p><h1>Not Found</h1><p class="lede">No candidate page matches this URL.</p></div></header>
      </div>
    `;
    return;
  }

  const partyRows = rows.filter(candidate => candidate.party === row.party);
  const index = partyRows.findIndex(candidate => candidate.entity === row.entity);
  const prev = partyRows[(index - 1 + partyRows.length) % partyRows.length];
  const next = partyRows[(index + 1) % partyRows.length];
  const hasTrump = row.trump_endorsement_chance != null;
  const captured = new Date(snapshot.captured_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const dashboardHref = `../../?party=${encodeURIComponent(row.party)}&weight_profile=${encodeURIComponent(profile.key)}`;

  document.title = `${row.entity} | Candidate Market/Polling Watch`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", `${row.entity} candidate detail page with market, polling, Vibes Check, catalysts, and mention-test notes.`);
  app.innerHTML = `
    <div class="wrap">
      <nav class="topline" aria-label="Candidate page navigation">
        <a class="back" href="${dashboardHref}">Back to dashboard</a>
        <div class="peer-nav">
          <a href="../${slugify(prev.entity)}/?weight_profile=${encodeURIComponent(profile.key)}">Prev: ${escapeHtml(prev.entity)}</a>
          <a href="../${slugify(next.entity)}/?weight_profile=${encodeURIComponent(profile.key)}">Next: ${escapeHtml(next.entity)}</a>
        </div>
      </nav>
      <header>
        <div>
          <p class="kicker">${escapeHtml(row.party)} · ${escapeHtml(row.tier)}</p>
          <h1>${escapeHtml(row.entity)}</h1>
          <p class="lede">${escapeHtml(row.vibes_rationale || row.note || "")}</p>
          <span class="stamp">Captured ${escapeHtml(captured)} · ${escapeHtml(profile.label)}</span>
        </div>
        <aside class="profile-tag">
          <span>Vibes Check</span>
          <strong>${escapeHtml(fmtVibe(row.vibes_score))}</strong>
          <span>${escapeHtml(profile.label)} lens · ${escapeHtml(snapshot.vibes_formula_version || snapshot.vibes_model?.formula_version || "formula unversioned")}</span>
        </aside>
      </header>

      <section class="metrics ${hasTrump ? "five-up" : ""}" aria-label="Candidate metrics">
        ${metricCard("Market", row.market_display, "market", pct(row.market_midpoint), "Current market-implied range")}
        ${metricCard("Polling", row.poll_display, "poll", row.poll_midpoint == null ? "0%" : pct(row.poll_midpoint), "Current polling range")}
        ${hasTrump ? metricCard("Trump endorse", row.trump_endorsement_display || fmt(row.trump_endorsement_chance), "endorse", fullPct(row.trump_endorsement_chance), row.trump_endorsement_note) : ""}
        ${metricCard("Vibes", fmtVibe(row.vibes_score), "vibes", vibePct(row.vibes_score), `Derived using ${profile.label}`)}
        ${metricCard("Good mentions", fmtShare(row.good_mention_share), "mentions-fill", fullPct(row.good_mention_share), row.mention_note)}
      </section>

      <main class="grid">
        <section class="panel">
          <span class="section-kicker">Current Read</span>
          <h2>Why This Page Exists</h2>
          <p class="read">${escapeHtml(row.note || "")}</p>
          <div class="note-list">
            <p class="note"><b>Next catalyst:</b> ${escapeHtml(row.catalyst_note || "Watch for explicit run/pass signals, early-state travel, donor movement, and first serious polling.")}</p>
            ${hasTrump ? `<p class="note"><b>Trump endorsement:</b> ${escapeHtml(row.trump_endorsement_note || "")}</p>` : ""}
            <p class="note"><b>${row.mention_test_seed ? "Priority mention test" : "Mention test"}:</b> ${escapeHtml(row.mention_note)}</p>
            <p class="note"><b>Evidence:</b> ${escapeHtml(row.evidence_notes || "not yet recorded")}</p>
            <p class="note"><b>Liability:</b> ${escapeHtml(row.liability_notes || "not yet recorded")}</p>
            <p class="note"><b>Confidence:</b> ${escapeHtml(row.confidence || "unknown")}</p>
          </div>
        </section>

        <aside class="panel">
          <span class="section-kicker">Candidate Authorship</span>
          <h2>Vibes Ingredients</h2>
          <div class="subscores">${subscoreRows(row, snapshot, profile)}</div>
        </aside>

        <section class="panel">
          <span class="section-kicker">Historical Hook</span>
          <h2>Market Baseline</h2>
          <div class="timeline">${historyRows(history, row.entity, profile)}</div>
        </section>

        <aside class="panel">
          <span class="section-kicker">Linkage</span>
          <h2>Share / Compare</h2>
          <p class="read">This page is generated from the dashboard snapshot data, so links stay stable while metrics update with future captures.</p>
          <div class="footer-links">
            <a class="source-link" href="${dashboardHref}">Dashboard view</a>
            <a class="source-link" href="../../snapshots.json">Snapshot JSON</a>
            <a class="source-link" href="../${slugify(row.entity)}/?weight_profile=hope_cycle">Hope lens</a>
            <a class="source-link" href="../${slugify(row.entity)}/?weight_profile=referendum_cycle">Referendum lens</a>
          </div>
        </aside>
      </main>
    </div>
  `;
}

async function init() {
  const response = await fetch("../../snapshots.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load snapshots.json: ${response.status}`);
  const data = await response.json();
  const history = Array.isArray(data) ? data : [data];
  const latest = history
    .filter(snapshot => snapshot.rows?.length)
    .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
    .at(-1);
  if (!latest) throw new Error("No snapshot rows available.");
  render(latest, history);
}

init().catch(error => {
  document.getElementById("app").innerHTML = `
    <div class="wrap">
      <a class="back" href="../../">Back to dashboard</a>
      <header><div><p class="kicker">Candidate detail</p><h1>Load Error</h1><p class="lede">${escapeHtml(error.message)}</p></div></header>
    </div>
  `;
});
