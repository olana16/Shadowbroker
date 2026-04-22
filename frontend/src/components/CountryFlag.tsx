import React from "react";

function FlagBox({ children, className = "", title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`relative inline-flex h-3.5 w-5 overflow-hidden rounded-[2px] border border-white/25 shadow-[0_0_0_1px_rgba(0,0,0,0.18)] ${className}`}
    >
      {children}
    </span>
  );
}

export function getCountryFlagCode(country: string | undefined | null): string {
  if (!country) return "";
  const normalized = country.trim().toUpperCase();
  const map: Record<string, string> = {
    US: "US",
    USA: "US",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    RUSSIA: "RU",
    "RUSSIAN FEDERATION": "RU",
    CHINA: "CN",
    FRANCE: "FR",
    JAPAN: "JP",
    FINLAND: "FI",
    ITALY: "IT",
    GERMANY: "DE",
    SPAIN: "ES",
    ISRAEL: "IL",
    UK: "GB",
    "UNITED KINGDOM": "GB",
    BRITAIN: "GB",
    EU: "EU",
    "EUROPEAN UNION": "EU",
    INTL: "UN",
    INTERNATIONAL: "UN",
  };
  return map[normalized] || (/^[A-Z]{2}$/.test(normalized) ? normalized : "");
}

export default function CountryFlag({ country }: { country?: string | null }) {
  const code = getCountryFlagCode(country);
  const title = country || "";

  switch (code) {
    case "US":
      return (
        <FlagBox
          title={title}
          className="bg-[repeating-linear-gradient(to_bottom,#b22234_0,#b22234_8%,#ffffff_8%,#ffffff_16%)]"
        >
          <span className="absolute left-0 top-0 h-[58%] w-[45%] bg-[#3c3b6e]" />
        </FlagBox>
      );
    case "RU":
      return <FlagBox title={title} className="bg-[linear-gradient(to_bottom,#ffffff_0,#ffffff_33%,#2456d3_33%,#2456d3_66%,#c63d3d_66%,#c63d3d_100%)]" />;
    case "CN":
      return (
        <FlagBox title={title} className="bg-[#de2910]">
          <span className="absolute left-[3px] top-[2px] h-[4px] w-[4px] rounded-full bg-[#ffde00]" />
        </FlagBox>
      );
    case "FR":
      return <FlagBox title={title} className="bg-[linear-gradient(to_right,#1f4db8_0,#1f4db8_33%,#ffffff_33%,#ffffff_66%,#d83a3a_66%,#d83a3a_100%)]" />;
    case "JP":
      return (
        <FlagBox title={title} className="bg-white">
          <span className="absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#bc002d]" />
        </FlagBox>
      );
    case "FI":
      return (
        <FlagBox title={title} className="bg-white">
          <span className="absolute left-[30%] top-0 h-full w-[20%] bg-[#003580]" />
          <span className="absolute left-0 top-[38%] h-[24%] w-full bg-[#003580]" />
        </FlagBox>
      );
    case "IT":
      return <FlagBox title={title} className="bg-[linear-gradient(to_right,#009246_0,#009246_33%,#ffffff_33%,#ffffff_66%,#ce2b37_66%,#ce2b37_100%)]" />;
    case "DE":
      return <FlagBox title={title} className="bg-[linear-gradient(to_bottom,#111111_0,#111111_33%,#d00f1f_33%,#d00f1f_66%,#ffce00_66%,#ffce00_100%)]" />;
    case "ES":
      return <FlagBox title={title} className="bg-[linear-gradient(to_bottom,#aa151b_0,#aa151b_25%,#f1bf00_25%,#f1bf00_75%,#aa151b_75%,#aa151b_100%)]" />;
    case "IL":
      return (
        <FlagBox title={title} className="bg-white">
          <span className="absolute left-0 top-[2px] h-[2px] w-full bg-[#0038b8]" />
          <span className="absolute bottom-[2px] left-0 h-[2px] w-full bg-[#0038b8]" />
          <span className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[#0038b8]" />
        </FlagBox>
      );
    case "EU":
      return (
        <FlagBox title={title} className="bg-[#003399]">
          <span className="absolute left-1/2 top-1/2 h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffcc00]" />
        </FlagBox>
      );
    case "UN":
      return (
        <FlagBox title={title} className="bg-[#4b92db]">
          <span className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90" />
        </FlagBox>
      );
    default:
      return null;
  }
}
