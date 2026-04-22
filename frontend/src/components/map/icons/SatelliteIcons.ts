// Satellite icon SVG builder and mission-type mappings
// Extracted from MaplibreViewer.tsx — pure data, no JSX

export const makeSatSvg = (color: string, beamColor = color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <defs>
            <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#bcd7ff"/>
                <stop offset="45%" stop-color="#5f8cff"/>
                <stop offset="100%" stop-color="#13213d"/>
            </linearGradient>
            <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#f8f1d1"/>
                <stop offset="55%" stop-color="${color}"/>
                <stop offset="100%" stop-color="#352100"/>
            </linearGradient>
            <linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${beamColor}" stop-opacity="0.8"/>
                <stop offset="55%" stop-color="${beamColor}" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="${beamColor}" stop-opacity="0"/>
            </linearGradient>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.6"/>
            </filter>
        </defs>

        <ellipse cx="24" cy="40" rx="11" ry="3.5" fill="${beamColor}" opacity="0.14" filter="url(#softGlow)"/>
        <path d="M21 24 L27 24 L33.5 45 L14.5 45 Z" fill="url(#beamGrad)"/>

        <g transform="translate(24 18) rotate(-18) translate(-24 -18)">
            <path d="M6 15 L17 12 L18 18 L7 21 Z" fill="url(#panelGrad)" stroke="#d9e8ff" stroke-width="0.7"/>
            <path d="M30 18 L41 15 L42 21 L31 24 Z" fill="url(#panelGrad)" stroke="#d9e8ff" stroke-width="0.7"/>
            <path d="M17.5 14.5 L21 15.3" stroke="#9cb6ff" stroke-width="1.1" stroke-linecap="round"/>
            <path d="M27 20.7 L30.5 21.5" stroke="#9cb6ff" stroke-width="1.1" stroke-linecap="round"/>

            <rect x="19" y="12.5" width="10" height="11" rx="2.2" fill="url(#bodyGrad)" stroke="#fff2c2" stroke-width="0.9"/>
            <rect x="21.2" y="14.4" width="5.6" height="4.2" rx="0.9" fill="#fff8d8" opacity="0.8"/>
            <circle cx="24" cy="19.8" r="1.7" fill="#ffffff" opacity="0.95"/>
            <path d="M25.5 23.5 L29.5 27.8" stroke="#d7b55a" stroke-width="1.2" stroke-linecap="round"/>
            <circle cx="31.2" cy="29.4" r="2.1" fill="none" stroke="#ebe2ff" stroke-width="1"/>
            <circle cx="31.2" cy="29.4" r="0.9" fill="#ffffff"/>

            <path d="M10 13.9 L14.5 12.7 M8.5 17.7 L16 15.7 M32 20.2 L39.5 18.3 M33.4 24 L37.8 22.8"
                stroke="#eef6ff" stroke-opacity="0.45" stroke-width="0.55"/>
        </g>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

export const MISSION_COLORS: Record<string, string> = {
    'military_recon': '#ff3333', 'military_sar': '#ff3333',
    'military_ew': '#ff66ff',
    'sar': '#00e5ff', 'sigint': '#ffffff',
    'navigation': '#4488ff', 'early_warning': '#ff00ff',
    'commercial_imaging': '#44ff44', 'space_station': '#ffdd00'
};

export const MISSION_ICON_MAP: Record<string, string> = {
    'military_recon': 'sat-mil', 'military_sar': 'sat-mil',
    'military_ew': 'sat-ew',
    'sar': 'sat-sar', 'sigint': 'sat-sigint',
    'navigation': 'sat-nav', 'early_warning': 'sat-ew',
    'commercial_imaging': 'sat-com', 'space_station': 'sat-station'
};
