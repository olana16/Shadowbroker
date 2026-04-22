const COUNTRY_TO_CODE: Record<string, string> = {
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

function codeToFlagEmoji(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(
    ...normalized.split("").map((char) => 127397 + char.charCodeAt(0)),
  );
}

export function getFlagEmojiForCountry(country: string | undefined | null): string {
  if (!country) return "";
  const normalized = country.trim().toUpperCase();
  const code = COUNTRY_TO_CODE[normalized] || (/^[A-Z]{2}$/.test(normalized) ? normalized : "");
  return code ? codeToFlagEmoji(code) : "";
}
