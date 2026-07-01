import { useState, useEffect } from "react";

const STORAGE_KEY = "investiq-portfolio-v1";

const DEFAULT_PORTFOLIO = [
  { id: 1, ticker: "SXRV", name: "iShares NASDAQ 100 USD ACC", qty: 0.185, avgPrice: 1260.2, currency: "EUR", type: "ETF" },
  { id: 2, ticker: "CSPX", name: "iShares Core S&P 500", qty: 1.12, avgPrice: 748.1571, currency: "USD", type: "ETF" }
];

// Beta: vs S&P 500 (source: Yahoo Finance / Morningstar, June 2026, approximate)
// Volatility: annualized 1Y historical volatility %
// These are static reference values — update periodically
const SCANNER_LIST = [
  { ticker: "VWCE", name: "Vanguard FTSE All-World ETF",      type: "ETF",   sector: "Global",        rsi: 44, vsMA200: 3.1,  momentum: "Moderate", revenueGrowth: null, pe: null, risk: "Low",    beta: 0.98, volatility: 13.2 },
  { ticker: "IWDA", name: "iShares Core MSCI World ETF",      type: "ETF",   sector: "Global",        rsi: 49, vsMA200: 5.3,  momentum: "Moderate", revenueGrowth: null, pe: null, risk: "Low",    beta: 0.99, volatility: 13.8 },
  { ticker: "CSPX", name: "iShares Core S&P 500",             type: "ETF",   sector: "US Large Cap",  rsi: 48, vsMA200: 3.1,  momentum: "Moderate", revenueGrowth: null, pe: null, risk: "Low",    beta: 1.00, volatility: 14.1 },
  { ticker: "CNDX", name: "iShares NASDAQ 100 UCITS ETF",     type: "ETF",   sector: "Tech",          rsi: 62, vsMA200: 8.2,  momentum: "Strong",   revenueGrowth: null, pe: null, risk: "Medium", beta: 1.18, volatility: 18.9 },
  { ticker: "SXRV", name: "iShares NASDAQ 100 USD ACC",       type: "ETF",   sector: "Tech",          rsi: 62, vsMA200: 8.2,  momentum: "Strong",   revenueGrowth: null, pe: null, risk: "Medium", beta: 1.18, volatility: 18.9 },
  { ticker: "IEMA", name: "iShares MSCI EM Markets ETF",      type: "ETF",   sector: "Emerging",      rsi: 71, vsMA200: 14.1, momentum: "Strong",   revenueGrowth: null, pe: null, risk: "High",   beta: 0.82, volatility: 17.4 },
  { ticker: "AAPL", name: "Apple Inc",                        type: "Stock", sector: "Tech",          rsi: 55, vsMA200: 6.1,  momentum: "Moderate", revenueGrowth: 5,    pe: 29,   risk: "Low",    beta: 1.24, volatility: 22.1 },
  { ticker: "MSFT", name: "Microsoft Corporation",            type: "Stock", sector: "Tech",          rsi: 51, vsMA200: 4.2,  momentum: "Moderate", revenueGrowth: 17,   pe: 31,   risk: "Medium", beta: 0.90, volatility: 20.3 },
  { ticker: "ASML", name: "ASML Holding NV",                  type: "Stock", sector: "Semiconductor", rsi: 47, vsMA200: 2.8,  momentum: "Moderate", revenueGrowth: 28,   pe: 34,   risk: "Medium", beta: 1.31, volatility: 31.2 },
  { ticker: "NVDA", name: "Nvidia Corporation",               type: "Stock", sector: "Tech",          rsi: 58, vsMA200: 12.4, momentum: "Strong",   revenueGrowth: 122,  pe: 38,   risk: "High",   beta: 1.76, volatility: 52.8 },
];

// Portfolio beta/vol reference (for signals tab)
const PORTFOLIO_METRICS = {
  SXRV: { beta: 1.18, volatility: 18.9, rsi: 62, vsMA200: 8.2, tracks: "NASDAQ 100" },
  CSPX: { beta: 1.00, volatility: 14.1, rsi: 48, vsMA200: 3.1, tracks: "S&P 500" },
};

// Widely cited long-term nominal CAGR figures (pre-inflation), NOT live/verified data.
// S&P 500: ~10-10.5% since 1957 inception (includes multiple crashes: 1987, 2000-02, 2008, 2020, 2022).
// NASDAQ 100: ~13-15% since 1985 inception (higher due to tech concentration, but includes the 2000
//   dot-com crash where it fell ~83% — volatility is real, not just theoretical).
// MSCI World: ~8-9% since 1970 inception.
// These are historical averages only. Nothing here predicts future returns.
const REFERENCE_HISTORICAL_RETURN = {
  "NASDAQ 100": 13.0,
  "S&P 500": 10.5,
  "MSCI World": 8.5,
  "Individual Stock": null, // no reliable long-horizon figure — excluded from weighted calc
};

function portfolioWeightedReturn(portfolio, prices) {
  const totalVal = portfolio.reduce((sum, p) => sum + p.qty * (prices[p.ticker] || p.avgPrice), 0);
  if (totalVal === 0) return { weighted: null, breakdown: [] };
  let weightedSum = 0;
  let coveredWeight = 0;
  const breakdown = portfolio.map(p => {
    const val = p.qty * (prices[p.ticker] || p.avgPrice);
    const weightPct = (val / totalVal) * 100;
    const tracks = PORTFOLIO_METRICS[p.ticker]?.tracks || "Individual Stock";
    const ref = REFERENCE_HISTORICAL_RETURN[tracks];
    if (ref !== null) {
      weightedSum += (weightPct / 100) * ref;
      coveredWeight += weightPct;
    }
    return { ticker: p.ticker, tracks, weightPct, ref };
  });
  // Normalize to only the portion of the portfolio we have reference data for
  const weighted = coveredWeight > 0 ? (weightedSum / coveredWeight) * 100 : null;
  return { weighted, coveredWeight, breakdown };
}

function betaRiskLabel(beta) {
  if (beta < 0.85) return { text: "Defensive", color: "#1D9E75" };
  if (beta <= 1.15) return { text: "Market-like", color: "#BA7517" };
  if (beta <= 1.50) return { text: "Aggressive", color: "#D85A30" };
  return { text: "Very High", color: "#A32D2D" };
}

function volRiskLabel(vol) {
  if (vol < 16) return { text: "Low", color: "#1D9E75" };
  if (vol < 25) return { text: "Moderate", color: "#BA7517" };
  if (vol < 40) return { text: "High", color: "#D85A30" };
  return { text: "Very High", color: "#A32D2D" };
}

// Revised scoring — beta and volatility now reduce score for satellite sizing
function calcScore(item) {
  let s = 50;
  // RSI component
  if (item.rsi < 40) s += 20;
  else if (item.rsi < 50) s += 10;
  else if (item.rsi > 65) s -= 15;
  else if (item.rsi > 55) s -= 5;
  // Distance from 200d MA
  if (item.vsMA200 < 5) s += 10;
  else if (item.vsMA200 > 10) s -= 8;
  // Momentum (only reward if RSI not overbought)
  if (item.momentum === "Strong" && item.rsi < 60) s += 8;
  // Fundamentals (stocks only)
  if (item.revenueGrowth && item.revenueGrowth > 50) s += 12;
  else if (item.revenueGrowth && item.revenueGrowth > 20) s += 6;
  // Beta penalty — high beta = more risk, reduce score
  if (item.beta > 1.5) s -= 10;
  else if (item.beta > 1.2) s -= 4;
  else if (item.beta < 0.9) s += 4;
  // Volatility penalty — very high vol = harder to hold
  if (item.volatility > 40) s -= 12;
  else if (item.volatility > 25) s -= 5;
  else if (item.volatility < 16) s += 5;
  return Math.min(100, Math.max(0, s));
}

// Allocation: max position size adjusted by volatility
// High vol instruments get smaller % of satellite
function maxSatellitePct(item) {
  if (item.volatility > 40) return 0.25; // max 25% of satellite
  if (item.volatility > 25) return 0.40;
  return 0.60;
}

function signalLabel(score) {
  if (score >= 70) return { label: "Buy zone", color: "#1D9E75", bg: "#E1F5EE" };
  if (score >= 50) return { label: "Watch", color: "#BA7517", bg: "#FAEEDA" };
  return { label: "Wait", color: "#A32D2D", bg: "#FCEBEB" };
}

function rsiLabel(rsi) {
  if (rsi < 40) return { text: "Oversold", color: "#1D9E75" };
  if (rsi > 65) return { text: "Overbought", color: "#A32D2D" };
  return { text: "Neutral", color: "#BA7517" };
}

// Compound growth projection
// startValue: current portfolio value, monthly: monthly contribution
// years: horizon, annualReturnPct: assumed annual return
function projectGrowth(startValue, monthly, years, annualReturnPct) {
  const monthlyRate = annualReturnPct / 100 / 12;
  const months = years * 12;
  let balance = startValue;
  const series = [{ year: 0, balance: startValue, contributed: startValue }];
  let totalContributed = startValue;
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate) + monthly;
    totalContributed += monthly;
    if (m % 12 === 0) {
      series.push({ year: m / 12, balance, contributed: totalContributed });
    }
  }
  return { finalBalance: balance, totalContributed, totalGrowth: balance - totalContributed, series };
}

function allocationSuggestion(amount, portfolio, scannerItems) {
  const ownedTickers = portfolio.map(p => p.ticker);
  const scored = [...scannerItems].sort((a, b) => calcScore(b) - calcScore(a));
  const newPicks = scored.filter(t => !ownedTickers.includes(t.ticker));
  const coreAmount = Math.round(amount * 0.65);
  const satelliteAmount = amount - coreAmount;
  const splits = [];

  // Core: split between existing ETF positions by score
  const coreETFs = portfolio.filter(p => p.type === "ETF");
  if (coreETFs.length > 0) {
    const perCore = Math.round(coreAmount / coreETFs.length);
    coreETFs.forEach(p => {
      const meta = PORTFOLIO_METRICS[p.ticker] || {};
      splits.push({
        ticker: p.ticker, amount: perCore, type: "Core — add to existing",
        reason: `RSI ${meta.rsi || "—"} · Beta ${meta.beta || "—"} · Vol ${meta.volatility || "—"}% — reinforce core position`
      });
    });
  } else {
    splits.push({ ticker: "CSPX", amount: coreAmount, type: "Core", reason: "No ETF positions found — default to S&P 500" });
  }

  // Satellite: top non-owned pick, capped by volatility
  if (newPicks.length > 0 && satelliteAmount >= 10) {
    const top = newPicks[0];
    const capPct = maxSatellitePct(top);
    const capAmount = Math.round(Math.min(satelliteAmount, amount * capPct));
    splits.push({
      ticker: top.ticker, amount: capAmount, type: "Satellite — new position",
      reason: `Score ${calcScore(top)}/100 · Beta ${top.beta} · Vol ${top.volatility}% — capped at ${Math.round(capPct*100)}% of total due to volatility`
    });
    const remaining = satelliteAmount - capAmount;
    if (remaining > 10 && newPicks[1]) {
      splits.push({
        ticker: newPicks[1].ticker, amount: remaining, type: "Satellite — new position",
        reason: `Score ${calcScore(newPicks[1])}/100 · Beta ${newPicks[1].beta} · Vol ${newPicks[1].volatility}% — remainder of satellite budget`
      });
    }
  }
  return splits;
}

export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPos, setNewPos] = useState({ ticker: "", name: "", qty: "", avgPrice: "", currency: "EUR", type: "ETF" });
  const [allocAmount, setAllocAmount] = useState(250);
  const [filterType, setFilterType] = useState("All");
  const [aiQ, setAiQ] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [monthlyContrib, setMonthlyContrib] = useState(200);
  const [projYears, setProjYears] = useState(20);
  const [customReturn, setCustomReturn] = useState(8);
  const [prices] = useState({ SXRV: 1495.2, CSPX: 796.8, VWCE: 112.4, CNDX: 1495.2, NVDA: 131.4, MSFT: 454.2, ASML: 742.8, AAPL: 211.3, IEMA: 28.4, IWDA: 98.7 });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { try { setPortfolio(JSON.parse(saved)); } catch { setPortfolio(DEFAULT_PORTFOLIO); } }
    else setPortfolio(DEFAULT_PORTFOLIO);
    setLoaded(true);
  }, []);

  useEffect(() => { if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); }, [portfolio, loaded]);

  useEffect(() => {
    if (loaded && portfolio.length > 0) {
      const { weighted } = portfolioWeightedReturn(portfolio, prices);
      if (weighted !== null) setCustomReturn(Math.round(weighted * 10) / 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const addPosition = () => {
    if (!newPos.ticker || !newPos.qty || !newPos.avgPrice) return;
    setPortfolio(prev => [...prev, { id: Date.now(), ticker: newPos.ticker.toUpperCase(), name: newPos.name || newPos.ticker.toUpperCase(), qty: parseFloat(newPos.qty), avgPrice: parseFloat(newPos.avgPrice), currency: newPos.currency, type: newPos.type }]);
    setNewPos({ ticker: "", name: "", qty: "", avgPrice: "", currency: "EUR", type: "ETF" });
    setShowAddForm(false);
  };

  const removePosition = (id) => setPortfolio(prev => prev.filter(p => p.id !== id));

  const totalValue = portfolio.reduce((sum, p) => sum + p.qty * (prices[p.ticker] || p.avgPrice), 0);
  const totalCost = portfolio.reduce((sum, p) => sum + p.qty * p.avgPrice, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Portfolio-level weighted beta
  const weightedBeta = portfolio.length > 0
    ? portfolio.reduce((sum, p) => {
        const val = p.qty * (prices[p.ticker] || p.avgPrice);
        const b = PORTFOLIO_METRICS[p.ticker]?.beta || 1.0;
        return sum + (val / totalValue) * b;
      }, 0)
    : 1.0;

  const scannerItems = SCANNER_LIST.map(i => ({ ...i, score: calcScore(i) })).sort((a, b) => b.score - a.score);
  const filtered = filterType === "All" ? scannerItems : scannerItems.filter(i => i.type === filterType || i.sector === filterType);
  const allocSuggestions = allocationSuggestion(allocAmount, portfolio, scannerItems);

  const askAI = async () => {
    if (!aiQ.trim()) return;
    setAiLoading(true); setAiResponse("");
    const portfolioSummary = portfolio.map(p => {
      const price = prices[p.ticker] || p.avgPrice;
      const pnl = (price - p.avgPrice) * p.qty;
      const meta = PORTFOLIO_METRICS[p.ticker] || {};
      return `${p.ticker}: ${p.qty} units @ avg ${p.avgPrice} ${p.currency}, current ~${price}, P&L ~${pnl.toFixed(2)}, beta ${meta.beta||"n/a"}, volatility ${meta.volatility||"n/a"}%`;
    }).join("\n");
    const systemPrompt = `You are a financial analyst assistant. Portfolio:\n${portfolioSummary}\nTotal value: ~€${totalValue.toFixed(2)}, P&L: ~€${totalPnL.toFixed(2)} (${totalPnLPct.toFixed(1)}%), Weighted portfolio beta: ${weightedBeta.toFixed(2)}\n\nBe concise and factual. Use beta and volatility in your analysis where relevant. Always note this is not financial advice. Max 180 words. Respond in the same language as the question.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt, messages: [{ role: "user", content: aiQ }] }) });
      const data = await res.json();
      setAiResponse(data.content?.find(b => b.type === "text")?.text || "No response.");
    } catch { setAiResponse("Error contacting AI. Please try again."); }
    setAiLoading(false);
  };

  const s = {
    app: { fontFamily: "system-ui,-apple-system,sans-serif", background: "#f8f8f6", minHeight: "100vh", paddingBottom: 80 },
    header: { background: "#fff", borderBottom: "0.5px solid #e5e5e3", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    tabs: { display: "flex", background: "#fff", borderBottom: "0.5px solid #e5e5e3", position: "sticky", top: 0, zIndex: 10 },
    tab: (a) => ({ flex: 1, padding: "10px 2px", textAlign: "center", fontSize: 11, color: a ? "#185FA5" : "#888", fontWeight: a ? 600 : 400, borderBottom: a ? "2px solid #185FA5" : "2px solid transparent", cursor: "pointer" }),
    section: { padding: "12px 14px" },
    label: { fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 600 },
    card: { background: "#fff", borderRadius: 12, border: "0.5px solid #e5e5e3", padding: "12px 14px", marginBottom: 8 },
    statRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 },
    statCard: { background: "#fff", borderRadius: 10, padding: "10px 12px", border: "0.5px solid #e5e5e3" },
    badge: (color, bg) => ({ fontSize: 10, padding: "3px 8px", borderRadius: 20, fontWeight: 600, color, background: bg, display: "inline-block" }),
    metricRow: { display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 },
    input: { width: "100%", padding: "9px 12px", border: "0.5px solid #e5e5e3", borderRadius: 8, fontSize: 13, background: "#fff", color: "#1a1a18", boxSizing: "border-box", outline: "none" },
    select: { width: "100%", padding: "9px 12px", border: "0.5px solid #e5e5e3", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" },
    btn: { padding: "9px 16px", border: "0.5px solid #d0d0ce", borderRadius: 8, fontSize: 12, background: "#fff", color: "#1a1a18", cursor: "pointer", fontWeight: 500 },
    btnP: { padding: "9px 16px", border: "none", borderRadius: 8, fontSize: 12, background: "#185FA5", color: "#fff", cursor: "pointer", fontWeight: 600 },
    divider: { height: "0.5px", background: "#f0f0ee", margin: "10px 0" },
    chip: (a) => ({ padding: "4px 10px", borderRadius: 20, fontSize: 11, border: `0.5px solid ${a?"#185FA5":"#e5e5e3"}`, color: a?"#185FA5":"#888", background: a?"#E6F1FB":"#fff", cursor: "pointer", whiteSpace: "nowrap", fontWeight: a?600:400 }),
    scoreBar: (n) => ({ height: 5, borderRadius: 4, width: `${n}%`, background: n>=70?"#1D9E75":n>=50?"#BA7517":"#A32D2D" }),
  };

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a18", letterSpacing: "-0.3px" }}>InvestIQ</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>Portfolio Advisor</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: totalPnL>=0?"#1D9E75":"#A32D2D" }}>€{totalValue.toFixed(0)}</div>
          <div style={{ fontSize: 10, color: totalPnL>=0?"#1D9E75":"#A32D2D" }}>+€{totalPnL.toFixed(0)} ({totalPnLPct.toFixed(1)}%)</div>
        </div>
      </div>

      <div style={s.tabs}>
        {[["portfolio","Portfolio"],["signals","Signals"],["scanner","Scanner"],["allocate","Allocate"],["projection","Projection"],["ai","AI Advisor"]].map(([id,label]) => (
          <div key={id} style={s.tab(tab===id)} onClick={() => setTab(id)}>{label}</div>
        ))}
      </div>

      {/* ── PORTFOLIO TAB ── */}
      {tab==="portfolio" && (
        <div style={s.section}>
          <div style={s.statRow}>
            <div style={s.statCard}>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Total value</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#1a1a18" }}>€{totalValue.toFixed(0)}</div>
              <div style={{ fontSize: 11, color: "#1D9E75", marginTop: 2 }}>+€{totalPnL.toFixed(0)} all-time</div>
            </div>
            <div style={s.statCard}>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Portfolio Beta</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#1a1a18" }}>{weightedBeta.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: betaRiskLabel(weightedBeta).color, marginTop: 2 }}>{betaRiskLabel(weightedBeta).text}</div>
            </div>
          </div>

          <div style={s.label}>Allocation</div>
          {portfolio.map((p,i) => {
            const val = p.qty*(prices[p.ticker]||p.avgPrice);
            const pct = totalValue>0?(val/totalValue)*100:0;
            const colors=["#185FA5","#1D9E75","#BA7517","#8B5CF6","#D85A30"];
            return (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ fontSize:11, color:"#888", width:44 }}>{p.ticker}</div>
                <div style={{ height:5, borderRadius:4, background:"#f0f0ee", flex:1 }}><div style={{ height:5, borderRadius:4, width:`${pct}%`, background:colors[i%colors.length] }} /></div>
                <div style={{ fontSize:11, fontWeight:600, color:"#1a1a18", width:34, textAlign:"right" }}>{pct.toFixed(0)}%</div>
              </div>
            );
          })}

          <div style={s.divider} />
          <div style={s.label}>Positions</div>
          {portfolio.map(p => {
            const price = prices[p.ticker]||p.avgPrice;
            const pnl = (price-p.avgPrice)*p.qty;
            const pnlPct = ((price-p.avgPrice)/p.avgPrice)*100;
            const meta = PORTFOLIO_METRICS[p.ticker]||{};
            return (
              <div key={p.id} style={s.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a1a18" }}>{p.ticker} <span style={{ fontSize:10, color:"#aaa", fontWeight:400 }}>{p.type}</span></div>
                    <div style={{ fontSize:10, color:"#aaa", marginTop:1 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>{p.qty} units · avg {p.avgPrice.toFixed(2)} {p.currency}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1a1a18" }}>{price.toFixed(2)}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:pnl>=0?"#1D9E75":"#A32D2D" }}>{pnl>=0?"+":""}{pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)</div>
                  </div>
                </div>
                {meta.beta && (
                  <div style={{ display:"flex", gap:16, marginTop:8, paddingTop:8, borderTop:"0.5px solid #f0f0ee" }}>
                    <div>
                      <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5 }}>Beta</div>
                      <div style={{ fontSize:12, fontWeight:600, color:betaRiskLabel(meta.beta).color }}>{meta.beta} · {betaRiskLabel(meta.beta).text}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5 }}>Volatility</div>
                      <div style={{ fontSize:12, fontWeight:600, color:volRiskLabel(meta.volatility).color }}>{meta.volatility}% · {volRiskLabel(meta.volatility).text}</div>
                    </div>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
                  <button style={{ ...s.btn, fontSize:11, padding:"4px 10px", color:"#A32D2D", borderColor:"#F7C1C1" }} onClick={() => removePosition(p.id)}>Remove</button>
                </div>
              </div>
            );
          })}

          {!showAddForm ? (
            <button style={{ ...s.btn, width:"100%", marginTop:4 }} onClick={() => setShowAddForm(true)}>+ Add position</button>
          ) : (
            <div style={s.card}>
              <div style={s.label}>New position</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <input style={s.input} placeholder="Ticker (e.g. NVDA)" value={newPos.ticker} onChange={e => setNewPos(p=>({...p,ticker:e.target.value}))} />
                <input style={s.input} placeholder="Name (optional)" value={newPos.name} onChange={e => setNewPos(p=>({...p,name:e.target.value}))} />
                <input style={s.input} placeholder="Quantity (e.g. 0.5)" type="number" step="0.001" value={newPos.qty} onChange={e => setNewPos(p=>({...p,qty:e.target.value}))} />
                <input style={s.input} placeholder="Avg purchase price" type="number" step="0.01" value={newPos.avgPrice} onChange={e => setNewPos(p=>({...p,avgPrice:e.target.value}))} />
                <div style={{ display:"flex", gap:8 }}>
                  <select style={{ ...s.select, flex:1 }} value={newPos.currency} onChange={e => setNewPos(p=>({...p,currency:e.target.value}))}>
                    <option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option>
                  </select>
                  <select style={{ ...s.select, flex:1 }} value={newPos.type} onChange={e => setNewPos(p=>({...p,type:e.target.value}))}>
                    <option value="ETF">ETF</option><option value="Stock">Stock</option>
                  </select>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...s.btn, flex:1 }} onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button style={{ ...s.btnP, flex:1 }} onClick={addPosition}>Add</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SIGNALS TAB ── */}
      {tab==="signals" && (
        <div style={s.section}>
          <div style={s.label}>Entry signals — your positions</div>
          {portfolio.map(p => {
            const meta = PORTFOLIO_METRICS[p.ticker]||{ rsi:55, vsMA200:5, beta:1.0, volatility:18 };
            const score = calcScore({ ...meta, momentum:"Moderate", risk:"Medium" });
            const sig = signalLabel(score);
            const rsiL = rsiLabel(meta.rsi);
            const betaL = betaRiskLabel(meta.beta);
            const volL = volRiskLabel(meta.volatility);
            return (
              <div key={p.id} style={s.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a1a18" }}>{p.ticker}</div>
                  <span style={s.badge(sig.color, sig.bg)}>{sig.label}</span>
                </div>
                <div style={s.metricRow}><span style={{ color:"#888" }}>RSI (14d)</span><span style={{ fontWeight:600, color:rsiL.color }}>{meta.rsi} — {rsiL.text}</span></div>
                <div style={s.metricRow}><span style={{ color:"#888" }}>vs 200d MA</span><span style={{ fontWeight:600, color:"#1D9E75" }}>+{meta.vsMA200}% above</span></div>
                <div style={s.divider} />
                <div style={{ display:"flex", gap:20 }}>
                  <div>
                    <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 }}>Beta</div>
                    <div style={{ fontSize:12, fontWeight:700, color:betaL.color }}>{meta.beta}</div>
                    <div style={{ fontSize:10, color:betaL.color }}>{betaL.text}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 }}>Volatility (1Y)</div>
                    <div style={{ fontSize:12, fontWeight:700, color:volL.color }}>{meta.volatility}%</div>
                    <div style={{ fontSize:10, color:volL.color }}>{volL.text}</div>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"#888", marginTop:8, paddingTop:8, borderTop:"0.5px solid #f0f0ee" }}>
                  {meta.rsi>65?"Overbought — not ideal entry. High volatility means larger swings if you add now.":meta.rsi<45?"Oversold zone — potential entry. Beta within range.":"Neutral RSI. Beta and volatility within acceptable range for DCA entry."}
                </div>
              </div>
            );
          })}

          <div style={{ ...s.label, marginTop:12 }}>Portfolio risk summary</div>
          <div style={s.card}>
            <div style={s.metricRow}><span style={{ color:"#888" }}>Weighted Beta</span><span style={{ fontWeight:700, color:betaRiskLabel(weightedBeta).color }}>{weightedBeta.toFixed(2)} — {betaRiskLabel(weightedBeta).text}</span></div>
            <div style={{ fontSize:11, color:"#888", marginTop:6 }}>A beta of {weightedBeta.toFixed(2)} means your portfolio moves approximately {(weightedBeta*100).toFixed(0)}% for every 100% market move. This is {weightedBeta<1.1?"slightly above market average — acceptable for a NASDAQ-heavy core":"above market average — consider balancing with lower-beta instruments"}.</div>
          </div>

          <div style={{ ...s.label, marginTop:4 }}>DCA reminder</div>
          <div style={s.card}>
            <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Consistent monthly contributions statistically outperform market-timing strategies for retail investors. Beta and volatility inform position size, not timing.</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#185FA5" }}>Next action: invest regardless of RSI — adjust size based on volatility</div>
          </div>
        </div>
      )}

      {/* ── SCANNER TAB ── */}
      {tab==="scanner" && (
        <div style={s.section}>
          <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto", paddingBottom:2 }}>
            {["All","ETF","Stock","Tech","Global"].map(f => (
              <div key={f} style={s.chip(filterType===f)} onClick={() => setFilterType(f)}>{f}</div>
            ))}
          </div>
          <div style={s.label}>Scored 0–100 · RSI + Momentum + Beta + Volatility</div>
          {filtered.map(item => {
            const sig = signalLabel(item.score);
            const rsiL = rsiLabel(item.rsi);
            const betaL = betaRiskLabel(item.beta);
            const volL = volRiskLabel(item.volatility);
            return (
              <div key={item.ticker} style={s.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:700, color:"#1a1a18" }}>{item.ticker}</span>
                    <span style={{ fontSize:10, color:"#aaa", marginLeft:6 }}>{item.type} · {item.sector}</span>
                  </div>
                  <span style={s.badge(sig.color, sig.bg)}>{sig.label}</span>
                </div>
                <div style={{ fontSize:11, color:"#aaa", marginBottom:8 }}>{item.name}</div>

                <div style={s.metricRow}><span style={{ color:"#888" }}>RSI</span><span style={{ color:rsiL.color, fontWeight:600 }}>{item.rsi} — {rsiL.text}</span></div>
                <div style={s.metricRow}><span style={{ color:"#888" }}>vs 200d MA</span><span style={{ fontWeight:600, color:item.vsMA200<5?"#1D9E75":item.vsMA200>10?"#A32D2D":"#BA7517" }}>+{item.vsMA200}%</span></div>

                <div style={s.divider} />

                <div style={{ display:"flex", gap:12, marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>Beta</div>
                    <div style={{ fontSize:12, fontWeight:700, color:betaL.color }}>{item.beta}</div>
                    <div style={{ fontSize:10, color:betaL.color }}>{betaL.text}</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>Volatility (1Y)</div>
                    <div style={{ fontSize:12, fontWeight:700, color:volL.color }}>{item.volatility}%</div>
                    <div style={{ fontSize:10, color:volL.color }}>{volL.text}</div>
                  </div>
                  {item.revenueGrowth && (
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, color:"#aaa", textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>Rev Growth</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#185FA5" }}>+{item.revenueGrowth}%</div>
                      <div style={{ fontSize:10, color:"#aaa" }}>YoY</div>
                    </div>
                  )}
                </div>

                <div style={{ background:"#f0f0ee", borderRadius:4, height:5, marginBottom:4 }}>
                  <div style={s.scoreBar(item.score)} />
                </div>
                <div style={{ fontSize:10, color:"#aaa" }}>Score {item.score}/100</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ALLOCATE TAB ── */}
      {tab==="allocate" && (
        <div style={s.section}>
          <div style={s.label}>Available capital</div>
          <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center" }}>
            <span style={{ fontSize:16, fontWeight:700, color:"#1a1a18" }}>€</span>
            <input style={{ ...s.input, fontSize:16, fontWeight:700 }} type="number" value={allocAmount} onChange={e => setAllocAmount(Number(e.target.value))} />
          </div>

          <div style={s.label}>Suggested split</div>
          <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>65% core / 35% satellite. Satellite allocation capped by instrument volatility.</div>

          {allocSuggestions.map((a,i) => (
            <div key={i} style={{ background:"#EDF4FC", border:"0.5px solid #B5D4F4", borderRadius:10, padding:12, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#185FA5" }}>€{a.amount}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a1a18" }}>→ {a.ticker}</div>
                </div>
                <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:a.type.includes("Satellite")?"#FAEEDA":"#E1F5EE", color:a.type.includes("Satellite")?"#BA7517":"#1D9E75", fontWeight:600 }}>{a.type}</span>
              </div>
              <div style={{ fontSize:11, color:"#888", marginTop:6 }}>{a.reason}</div>
            </div>
          ))}

          <div style={{ ...s.card, background:"#FFF8F0", border:"0.5px solid #FAEEDA", marginTop:8 }}>
            <div style={{ fontSize:11, color:"#BA7517", fontWeight:600, marginBottom:4 }}>⚠ Disclaimer</div>
            <div style={{ fontSize:11, color:"#888" }}>Mechanical suggestion based on RSI, beta, and volatility rules — not financial advice. Always verify before executing.</div>
          </div>
        </div>
      )}

      {/* ── PROJECTION TAB ── */}
      {tab==="projection" && (() => {
        const { weighted, coveredWeight, breakdown } = portfolioWeightedReturn(portfolio, prices);
        const scenarios = [
          { label: "Συντηρητικό", pct: Math.max(1, customReturn - 3), color: "#888" },
          { label: `Το δικό σου (${customReturn}%)`, pct: customReturn, color: "#185FA5" },
          { label: "Αισιόδοξο", pct: customReturn + 3, color: "#1D9E75" },
        ];
        const results = scenarios.map(sc => ({ ...sc, ...projectGrowth(totalValue, monthlyContrib, projYears, sc.pct) }));
        const maxBalance = Math.max(...results.map(r => r.finalBalance));
        return (
          <div style={s.section}>
            <div style={s.label}>Μέση απόδοση βάσει του portfolio σου</div>
            <div style={s.card}>
              {breakdown.map(b => (
                <div key={b.ticker} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
                  <span style={{ color:"#888" }}>{b.ticker} <span style={{ fontSize:10, color:"#aaa" }}>({b.tracks})</span></span>
                  <span style={{ fontWeight:600, color:"#1a1a18" }}>{b.weightPct.toFixed(0)}% · {b.ref !== null ? `${b.ref}%/έτος` : "χωρίς αξιόπιστο ιστορικό"}</span>
                </div>
              ))}
              <div style={s.divider} />
              {weighted !== null ? (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:"#1a1a18" }}>Σταθμισμένος ιστορικός μέσος όρος</span>
                    <span style={{ fontSize:16, fontWeight:700, color:"#185FA5" }}>{weighted.toFixed(1)}%</span>
                  </div>
                  <button style={{ ...s.btn, width:"100%", marginTop:10 }} onClick={() => setCustomReturn(Math.round(weighted*10)/10)}>Χρήση αυτού του ποσοστού παρακάτω</button>
                </>
              ) : (
                <div style={{ fontSize:11, color:"#888" }}>Δεν υπάρχουν αρκετά instruments με αξιόπιστο μακροπρόθεσμο ιστορικό στο portfolio σου.</div>
              )}
              <div style={{ fontSize:10, color:"#aaa", marginTop:8 }}>
                Βασίζεται σε ευρέως αναγνωρισμένα ιστορικά CAGR (πριν πληθωρισμό): NASDAQ 100 ~13%/έτος, S&P 500 ~10.5%/έτος — <b>όχι επαληθευμένα live δεδομένα</b>, και δεν αντιπροσωπεύουν μελλοντική απόδοση. Και οι δύο δείκτες έχουν περάσει περιόδους πτώσης &gt;40% (π.χ. 2000-02, 2008).
              </div>
            </div>

            <div style={s.label}>Παράμετροι</div>
            <div style={s.card}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Μηνιαία συνεισφορά (€)</div>
                <input style={s.input} type="number" value={monthlyContrib} onChange={e => setMonthlyContrib(Number(e.target.value))} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Έτη</div>
                <input style={s.input} type="number" value={projYears} onChange={e => setProjYears(Number(e.target.value))} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Εκτιμώμενη ετήσια απόδοση (%)</div>
                <input style={s.input} type="number" step="0.5" value={customReturn} onChange={e => setCustomReturn(Number(e.target.value))} />
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Ξεκίνα από τον σταθμισμένο μέσο όρο παραπάνω και προσάρμοσε όπως θέλεις.</div>
              </div>
            </div>

            <div style={s.label}>Αποτέλεσμα σε {projYears} χρόνια</div>
            {results.map((r, i) => (
              <div key={i} style={{ ...s.card, borderLeft: `3px solid ${r.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.color }}>{r.label}</span>
                  <span style={{ fontSize: 11, color: "#aaa" }}>{r.pct.toFixed(1)}%/έτος</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a18", marginBottom: 6 }}>€{r.finalBalance.toLocaleString("el-GR", { maximumFractionDigits: 0 })}</div>
                <div style={{ background: "#f0f0ee", borderRadius: 4, height: 6, marginBottom: 8 }}>
                  <div style={{ height: 6, borderRadius: 4, width: `${(r.finalBalance / maxBalance) * 100}%`, background: r.color }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888" }}>
                  <span>Σύνολο εισφορών: €{r.totalContributed.toLocaleString("el-GR", { maximumFractionDigits: 0 })}</span>
                  <span>Κέρδος: €{r.totalGrowth.toLocaleString("el-GR", { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            ))}

            <div style={{ ...s.card, background: "#FFF8F0", border: "0.5px solid #FAEEDA", marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#BA7517", fontWeight: 600, marginBottom: 4 }}>⚠ Σημαντικό</div>
              <div style={{ fontSize: 11, color: "#888" }}>Αυτός ο υπολογισμός είναι μαθηματική προβολή σταθερής απόδοσης — όχι πρόβλεψη. Οι πραγματικές αγορές έχουν διακυμάνσεις χρόνο με τον χρόνο (κάποια χρόνια +25%, άλλα -20%), κάτι που αυτό το μοντέλο δεν αναπαριστά. Χρησιμοποίησέ το για να συγκρίνεις σενάρια, όχι για να προγραμματίσεις έξοδα.</div>
            </div>
          </div>
        );
      })()}


      {tab==="ai" && (
        <div style={s.section}>
          <div style={s.label}>AI Advisor</div>
          <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>Γνωρίζει το portfolio σου, το beta, τη volatility και τα signals. Ρώτα ελεύθερα.</div>

          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
            {[
              "Πού να βάλω τα €250 που αναμένω;",
              "Το beta του portfolio μου είναι υψηλό;",
              "Αξίζει να αγοράσω NVDA τώρα;",
              "Είναι καλά διαφοροποιημένο το portfolio μου;",
              "Εξήγησέ μου τι σημαίνει beta 1.18 για το SXRV"
            ].map(q => (
              <button key={q} style={{ ...s.btn, textAlign:"left", fontSize:12, padding:"8px 12px" }} onClick={() => setAiQ(q)}>{q}</button>
            ))}
          </div>

          <textarea style={{ width:"100%", padding:"10px 12px", border:"0.5px solid #e5e5e3", borderRadius:8, fontSize:13, background:"#fff", color:"#1a1a18", boxSizing:"border-box", resize:"none", minHeight:72, fontFamily:"inherit", outline:"none" }} placeholder="Γράψε την ερώτησή σου..." value={aiQ} onChange={e => setAiQ(e.target.value)} />
          <button style={{ ...s.btnP, width:"100%", marginTop:8 }} onClick={askAI} disabled={aiLoading}>
            {aiLoading ? "Αναλύω..." : "Ρώτα τον AI Advisor"}
          </button>

          {aiResponse && (
            <div style={{ background:"#EDF4FC", border:"0.5px solid #B5D4F4", borderRadius:12, padding:12, marginTop:10 }}>
              <div style={{ fontSize:10, color:"#185FA5", fontWeight:700, marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>AI Analysis</div>
              <div style={{ fontSize:13, color:"#1a1a18", lineHeight:1.6 }}>{aiResponse}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
