"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bug, ChevronDown, ChevronUp, ExternalLink, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { CybersecurityThreat, DashboardData, NewsArticle } from "@/types/dashboard";

type CyberFeedView = "all" | "vulnerabilities" | "news";

const CYBER_NEWS_SOURCES = new Set([
  "krebsonsecurity",
  "the hacker news",
  "bleepingcomputer",
  "microsoft security response center",
  "securityweek",
  "dark reading",
  "therecord",
]);

const CYBER_TERMS = [
  "cyber",
  "security",
  "ransomware",
  "malware",
  "phishing",
  "breach",
  "cve-",
  "zero-day",
  "exploit",
  "vulnerability",
  "ddos",
  "botnet",
];

type CyberPanelItem = {
  id: string;
  kind: "vulnerability" | "news";
  title: string;
  subtitle: string;
  summary?: string;
  link?: string;
  riskScore: number;
  severityLabel: string;
  published?: string;
  vendor?: string;
  product?: string;
  cve?: string;
  knownRansomware?: boolean;
};

function normalizeSourceName(source: string | undefined): string {
  return String(source || "").trim().toLowerCase();
}

function isCyberArticle(item: NewsArticle): boolean {
  if (CYBER_NEWS_SOURCES.has(normalizeSourceName(item.source))) return true;
  const text = `${item.source || ""} ${item.title || ""} ${item.summary || ""}`.toLowerCase();
  return CYBER_TERMS.some((term) => text.includes(term));
}

function formatDateLabel(raw?: string | null): string {
  if (!raw) return "No timestamp";
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Addis_Ababa",
  }).format(date);
}

function tone(score: number) {
  if (score >= 9) return "border-red-500/30 bg-red-950/20 text-red-300";
  if (score >= 7) return "border-orange-500/30 bg-orange-950/20 text-orange-300";
  if (score >= 5) return "border-yellow-500/30 bg-yellow-950/20 text-yellow-300";
  return "border-cyan-500/30 bg-cyan-950/20 text-cyan-300";
}

function labelForSeverity(item: CybersecurityThreat): string {
  if (item.known_ransomware) return `${item.severity.toUpperCase()} · RANSOMWARE`;
  return item.severity.toUpperCase();
}

export default function CyberThreatPanel({ data }: { data: DashboardData }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [feedView, setFeedView] = useState<CyberFeedView>("all");

  const vulnerabilities = useMemo<CyberPanelItem[]>(
    () =>
      (data.cybersecurity || []).map((item) => ({
        id: item.id,
        kind: "vulnerability",
        title: item.title,
        subtitle: [item.source, item.vendor, item.product].filter(Boolean).join(" · "),
        summary: item.summary || item.short_description || item.required_action,
        link: item.link,
        riskScore: item.risk_score,
        severityLabel: labelForSeverity(item),
        published: item.published,
        vendor: item.vendor,
        product: item.product,
        cve: item.cve,
        knownRansomware: item.known_ransomware,
      })),
    [data.cybersecurity],
  );

  const cyberNews = useMemo<CyberPanelItem[]>(
    () =>
      [...(data.news || []), ...(data.telegram || [])]
        .filter(isCyberArticle)
        .map((item, index) => ({
          id: `news:${item.id ?? index}`,
          kind: "news",
          title: item.title,
          subtitle: item.source,
          summary: item.machine_assessment || item.summary,
          link: item.link,
          riskScore: item.risk_score || 1,
          severityLabel: `RISK ${item.risk_score || 1}/10`,
          published: item.published || item.pub_date,
        })),
    [data.news, data.telegram],
  );

  const visibleItems = useMemo(() => {
    const merged = (
      feedView === "vulnerabilities" ? vulnerabilities :
      feedView === "news" ? cyberNews :
      [...vulnerabilities, ...cyberNews]
    ).sort((a, b) => {
      const byRisk = b.riskScore - a.riskScore;
      if (byRisk !== 0) return byRisk;
      return new Date(b.published || 0).getTime() - new Date(a.published || 0).getTime();
    });
    return merged.slice(0, 16);
  }, [cyberNews, feedView, vulnerabilities]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.1 }}
      className="w-full overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 font-mono shadow-[0_4px_30px_rgba(0,0,0,0.2)] backdrop-blur-md"
    >
      <div
        className="flex cursor-pointer items-center justify-between border-b border-[var(--border-primary)]/50 p-3 transition-colors hover:bg-[var(--bg-secondary)]/50"
        onClick={() => setIsMinimized((current) => !current)}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert size={13} className="text-red-400" />
          <div>
            <div className="text-[8px] tracking-[0.24em] text-red-400/70">GLOBAL THREAT INTERCEPT</div>
            <div className="text-[10px] tracking-[0.18em] text-red-300">CYBER THREAT DESK</div>
            <div className="text-[9px] text-[var(--text-muted)]">Known exploited vulnerabilities and cyber reporting</div>
          </div>
        </div>
        <button className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
          {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex max-h-[34rem] flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-primary)]/50 px-3 py-2">
              <div className="flex items-center gap-1 rounded-md border border-red-900/40 bg-black/30 p-1">
                {([
                  { key: "all", label: "ALL", count: vulnerabilities.length + cyberNews.length },
                  { key: "vulnerabilities", label: "KEV", count: vulnerabilities.length },
                  { key: "news", label: "NEWS", count: cyberNews.length },
                ] as Array<{ key: CyberFeedView; label: string; count: number }>).map((tab) => {
                  const isActive = feedView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFeedView(tab.key)}
                      className={`rounded-sm border px-2 py-1 text-[8px] tracking-[0.2em] transition-colors ${
                        isActive
                          ? "border-red-400 bg-red-400 text-black"
                          : "border-red-900/40 text-red-300 hover:border-red-600/60 hover:text-red-200"
                      }`}
                    >
                      {tab.label} [{tab.count}]
                    </button>
                  );
                })}
              </div>
              <div className="text-[8px] tracking-[0.18em] text-red-300/80">
                {feedView === "vulnerabilities" ? "KNOWN EXPLOITED VULNERABILITIES" : feedView === "news" ? "CYBER NEWS" : "MERGED CYBER FEED"}
              </div>
            </div>

            <div className="styled-scrollbar flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-2">
                {visibleItems.length === 0 && (
                  <div className="rounded-lg border border-red-900/30 bg-red-950/10 px-3 py-4 text-center text-[10px] tracking-[0.15em] text-red-300/80">
                    NO CYBER ITEMS AVAILABLE
                  </div>
                )}

                {visibleItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.link || "#"}
                    target={item.link ? "_blank" : undefined}
                    rel={item.link ? "noreferrer" : undefined}
                    className={`block rounded-lg border p-3 transition-colors hover:border-red-400/40 ${tone(item.riskScore)}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[8px] tracking-[0.18em]">
                        {item.kind === "vulnerability" ? <Bug size={10} /> : <AlertTriangle size={10} />}
                        <span>{item.kind === "vulnerability" ? "VULNERABILITY" : "CYBER NEWS"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[8px] tracking-[0.18em]">
                        <span className="rounded border border-current/25 px-1.5 py-0.5">{item.severityLabel}</span>
                        {item.link && <ExternalLink size={10} />}
                      </div>
                    </div>

                    <div className="text-[11px] font-bold leading-snug text-[var(--text-primary)]">{item.title}</div>
                    <div className="mt-1 text-[9px] text-[var(--text-muted)]">{item.subtitle || "Cyber item"}</div>

                    {item.summary && (
                      <div className="mt-2 line-clamp-3 text-[10px] leading-relaxed text-[var(--text-secondary)]">
                        {item.summary}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[8px] tracking-[0.15em] text-[var(--text-muted)]">
                      {item.cve && <span className="rounded border border-cyan-500/20 px-1.5 py-0.5 text-cyan-300">{item.cve}</span>}
                      {item.vendor && <span className="rounded border border-[var(--border-primary)] px-1.5 py-0.5">{item.vendor}</span>}
                      {item.product && <span className="rounded border border-[var(--border-primary)] px-1.5 py-0.5">{item.product}</span>}
                      {item.knownRansomware && <span className="rounded border border-red-500/30 px-1.5 py-0.5 text-red-300">RANSOMWARE</span>}
                      {item.published && <span>{formatDateLabel(item.published)}</span>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
