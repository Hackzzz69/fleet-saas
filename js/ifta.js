/* ============================================================
   FleetDesk — IFTA tax engine (works on DB rows).
   Standard IFTA math:
     fleet MPG       = total miles / total fuel gallons (all states)
     taxable gallons = state miles / fleet MPG
     tax due         = taxable gallons x state diesel rate
     KY / VA surcharge = taxable gallons x surcharge (NO fuel credit)
     credit          = gallons bought in state x state rate
     net             = tax due + surcharge - credit
   ============================================================ */

const IFTA_RATES = {
  "2026Q1": {AL:0.31,AR:0.285,AZ:0.26,CA:0.971,CO:0.325,CT:0.489,DE:0.22,FL:0.4027,GA:0.371,IA:0.325,ID:0.32,IL:0.738,IN:0.61,KS:0.26,KY:0.22,LA:0.2,MA:0.24,MD:0.4675,ME:0.312,MI:0.524,MN:0.326,MO:0.295,MS:0.21,MT:0.2975,NC:0.41,ND:0.23,NE:0.318,NH:0.222,NJ:0.561,NM:0.21,NV:0.27,NY:0.3805,OH:0.47,OK:0.19,OR:0,PA:0.741,RI:0.4,SC:0.28,SD:0.28,TN:0.27,TX:0.2,UT:0.379,VA:0.327,VT:0.31,WA:0.584,WI:0.329,WV:0.357,WY:0.24},
  "2026Q2": {AL:0.31,AR:0.285,AZ:0.26,CA:0.971,CO:0.325,CT:0.489,DE:0.22,FL:0.4097,GA:0.373,IA:0.325,ID:0.32,IL:0.738,IN:0.63,KS:0.26,KY:0.22,LA:0.2,MA:0.24,MD:0.4675,ME:0.312,MI:0.524,MN:0.326,MO:0.295,MS:0.21,MT:0.2975,NC:0.41,ND:0.23,NE:0.318,NH:0.222,NJ:0.561,NM:0.21,NV:0.27,NY:0.3805,OH:0.47,OK:0.19,OR:0,PA:0.741,RI:0.4,SC:0.28,SD:0.28,TN:0.27,TX:0.2,UT:0.379,VA:0.327,VT:0.31,WA:0.584,WI:0.329,WV:0.357,WY:0.24},
  "2026Q3": {AL:0.31,AR:0.285,AZ:0.26,CA:0.979,CO:0.335,CT:0.499,DE:0.22,FL:0.4097,GA:0.373,IA:0.325,ID:0.32,IL:0.738,IN:0.63,KS:0.26,KY:0.22,LA:0.2,MA:0.24,MD:0.4745,ME:0.312,MI:0.524,MN:0.326,MO:0.295,MS:0.24,MT:0.2975,NC:0.41,ND:0.23,NE:0.318,NH:0.222,NJ:0.561,NM:0.21,NV:0.27,NY:0.3805,OH:0.47,OK:0.19,OR:0,PA:0.741,RI:0.4,SC:0.28,SD:0.28,TN:0.27,TX:0.2,UT:0.379,VA:0.336,VT:0.31,WA:0.595,WI:0.329,WV:0.357,WY:0.24},
  "2026Q4": {AL:0.31,AR:0.285,AZ:0.26,CA:0.979,CO:0.335,CT:0.499,DE:0.22,FL:0.4097,GA:0.373,IA:0.325,ID:0.32,IL:0.738,IN:0.63,KS:0.26,KY:0.22,LA:0.2,MA:0.24,MD:0.4745,ME:0.312,MI:0.524,MN:0.326,MO:0.295,MS:0.24,MT:0.2975,NC:0.41,ND:0.23,NE:0.318,NH:0.222,NJ:0.561,NM:0.21,NV:0.27,NY:0.3805,OH:0.47,OK:0.19,OR:0,PA:0.741,RI:0.4,SC:0.28,SD:0.28,TN:0.27,TX:0.2,UT:0.379,VA:0.336,VT:0.31,WA:0.595,WI:0.329,WV:0.357,WY:0.24},
};
const IFTA_SURCHARGES = {
  "2026Q1": {KY:0.105,VA:0.143}, "2026Q2": {KY:0.105,VA:0.143},
  "2026Q3": {KY:0.105,VA:0.143}, "2026Q4": {KY:0.105,VA:0.143},
};
const IFTA_DEADLINES = {
  "2026Q1": "April 30, 2026", "2026Q2": "July 31, 2026",
  "2026Q3": "November 2, 2026", "2026Q4": "February 1, 2027",
};
const IFTA_HOLIDAYS = {
  "2026Q4": [
    "OH fuel tax holiday: rate drops to $0.0001/gal Oct 4, 2026 – Jan 2, 2027. Split-quarter rates apply; miles and fuel must still be reported.",
    "GA fuel tax suspension extended through Nov 5, 2026: GA suspension-period miles are excluded from taxable miles, and tax-free GA fuel is excluded from tax-paid gallons.",
  ],
};
const DEFAULT_MPG = 6.5;

function iftaRatesFor(year, quarter) {
  const key = `${year}${quarter}`;
  const rates = IFTA_RATES[key];
  return rates ? { key, rates, surcharges: IFTA_SURCHARGES[key] || {},
                   deadline: IFTA_DEADLINES[key] || "",
                   holidays: IFTA_HOLIDAYS[key] || [] } : null;
}

function cleanState(s) {
  const m = String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
  return m.length === 2 ? m : null;
}

/* Accepts "2026-01-14" (DB) and legacy "1/14/26" (CSV import). */
function parseTripDate(str) {
  if (!str) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) d = new Date(str + "T12:00:00");
  else {
    const p = str.split("/");
    if (p.length !== 3) return null;
    const y = p[2].length === 2 ? "20" + p[2] : p[2];
    d = new Date(`${y}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}T12:00:00`);
  }
  return isNaN(d) ? null : d;
}

/* DB trips may carry state_miles as a JSON object {"TX":600}. */
function stateMilesForTrip(trip) {
  const sm = trip.state_miles;
  if (sm && typeof sm === "object" && Object.keys(sm).length) {
    const out = {};
    Object.entries(sm).forEach(([st, m]) => {
      const c = cleanState(st);
      if (c && Number(m) > 0) out[c] = (out[c] || 0) + Number(m);
    });
    if (Object.keys(out).length) return { miles: out, estimated: false };
  }
  const miles = Number(trip.mileage);
  if (!trip.route || isNaN(miles)) return { miles: {}, estimated: true };
  const states = trip.route.split(",").map(cleanState).filter(Boolean);
  if (!states.length) return { miles: {}, estimated: true };
  const per = miles / states.length;
  const out = {};
  states.forEach(s => { out[s] = (out[s] || 0) + per; });
  return { miles: out, estimated: true };
}

function computeIFTA(trips, fuel, mpgOverride) {
  const stateMiles = {};
  let totalMiles = 0, milesEstimated = false;

  trips.forEach(t => {
    const { miles, estimated } = stateMilesForTrip(t);
    if (estimated) milesEstimated = true;
    Object.entries(miles).forEach(([st, m]) => {
      stateMiles[st] = (stateMiles[st] || 0) + m;
      totalMiles += m;
    });
  });

  const boughtByState = {};
  let totalGallons = 0;
  (fuel || []).forEach(f => {
    const st = cleanState(f.state);
    const g = Number(f.gallons);
    if (st && g > 0) {
      boughtByState[st] = (boughtByState[st] || 0) + g;
      totalGallons += g;
    }
  });

  let mpg, mpgEstimated = false;
  if (mpgOverride && mpgOverride > 0) { mpg = mpgOverride; mpgEstimated = true; }
  else if (totalGallons > 0) mpg = totalMiles / totalGallons;
  else { mpg = DEFAULT_MPG; mpgEstimated = true; }

  const rows = {};
  Object.entries(stateMiles).forEach(([st, miles]) => {
    rows[st] = { miles, taxableGal: miles / mpg, boughtGal: boughtByState[st] || 0 };
  });
  Object.entries(boughtByState).forEach(([st, g]) => {
    if (!rows[st]) rows[st] = { miles: 0, taxableGal: 0, boughtGal: g };
  });

  return { stateMiles, totalMiles, totalGallons, mpg, mpgEstimated,
           milesEstimated, rows };
}

function applyIFTARates(result, rateInfo) {
  const totals = { taxDue: 0, surcharge: 0, credit: 0, net: 0 };
  Object.entries(result.rows).forEach(([st, r]) => {
    const rate = rateInfo.rates[st];
    r.rate = rate === undefined ? null : rate;
    r.taxDue = r.rate === null ? null : r.taxableGal * r.rate;
    r.surcharge = (rateInfo.surcharges[st] || 0) * r.taxableGal;
    r.credit = r.boughtGal * (r.rate || 0);
    r.net = (r.taxDue || 0) + r.surcharge - r.credit;
    if (r.taxDue !== null) totals.taxDue += r.taxDue;
    totals.surcharge += r.surcharge;
    totals.credit += r.credit;
    totals.net += r.net;
  });
  result.totals = totals;
  result.rateInfo = rateInfo;
  return result;
}
