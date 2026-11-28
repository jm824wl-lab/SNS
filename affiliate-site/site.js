/* ------------------------------------------------------------------
   Site configuration. Edit the two blocks below; nothing else needs
   to change when links or prices are updated.
   ------------------------------------------------------------------ */

// 1) Affiliate links. Leave empty until each program approves you;
//    links then fall back to the vendor's normal public page.
const AFFILIATE_LINKS = {
  hubspot: "",   // e.g. the tracking link issued in impact.com
  pipedrive: "", // e.g. the tracking link issued in PartnerStack
};

// 2) Prices in USD per seat per month. Re-check on the vendors'
//    pricing pages and update PRICES_CHECKED whenever you do.
const PRICES_CHECKED = "November 2026";
const PLANS = [
  { vendor: "HubSpot",   plan: "Free CRM",               annual: 0,  monthly: 0,   setup: 0,    maxSeats: 2 },
  { vendor: "HubSpot",   plan: "Sales Hub Starter",      annual: 20, monthly: 20,  setup: 0 },
  { vendor: "HubSpot",   plan: "Sales Hub Professional", annual: 90, monthly: 100, setup: 1500 },
  { vendor: "Pipedrive", plan: "Lite",                   annual: 14, monthly: 24,  setup: 0 },
  { vendor: "Pipedrive", plan: "Growth",                 annual: 39, monthly: 49,  setup: 0 },
  { vendor: "Pipedrive", plan: "Premium",                annual: 59, monthly: 79,  setup: 0 },
];

/* ------------------------------------------------------------------ */

const usd = (n) => "$" + n.toLocaleString("en-US");

function applyAffiliateLinks() {
  document.querySelectorAll("a[data-aff]").forEach((a) => {
    const url = AFFILIATE_LINKS[a.dataset.aff];
    if (url) a.href = url;
  });
}

function renderPriceTable() {
  const body = document.querySelector("#price-rows");
  if (!body) return;
  body.innerHTML = PLANS.map((p) => `
    <tr>
      <th scope="row">${p.vendor} <span class="plan">${p.plan}</span></th>
      <td>${p.annual === 0 ? "Free" : usd(p.annual)}</td>
      <td>${p.monthly === 0 ? "Free" : usd(p.monthly)}</td>
      <td>${p.setup ? usd(p.setup) + " one-time" : "None listed"}</td>
    </tr>`).join("");
}

function renderCalculator() {
  const input = document.querySelector("#seats");
  const out = document.querySelector("#calc-rows");
  if (!input || !out) return;

  const update = () => {
    const seats = Math.min(50, Math.max(1, parseInt(input.value, 10) || 1));
    document.querySelector("#seats-label").textContent =
      seats + (seats === 1 ? " person" : " people");
    out.innerHTML = PLANS.map((p) => {
      const tooBig = p.maxSeats && seats > p.maxSeats;
      const total = p.annual * 12 * seats + p.setup;
      const cell = tooBig
        ? `<td class="muted">Covers up to ${p.maxSeats} users</td>`
        : `<td><strong>${total === 0 ? "Free" : usd(total)}</strong></td>`;
      return `<tr><th scope="row">${p.vendor} <span class="plan">${p.plan}</span></th>${cell}</tr>`;
    }).join("");
  };
  input.addEventListener("input", update);
  update();
}

document.addEventListener("DOMContentLoaded", () => {
  applyAffiliateLinks();
  renderPriceTable();
  renderCalculator();
  document.querySelectorAll("[data-prices-checked]").forEach((el) => {
    el.textContent = PRICES_CHECKED;
  });
});
