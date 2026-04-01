"use client";

import { API_BASE } from "@/lib/api";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tv, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

type LiveChannel = {
    name: string;
    region: string;
    youtube_url: string;
    enabled: boolean;
};

export default function LiveNewsPanel() {
    const [isMinimized, setIsMinimized] = useState(true);
    const [channels, setChannels] = useState<LiveChannel[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeEmbedUrl, setActiveEmbedUrl] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadChannels = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/settings/live-video-channels`, { cache: "no-store" });
                if (!res.ok) return;
                const json = await res.json();
                if (!cancelled && Array.isArray(json)) {
                    const enabled = json.filter((channel) => channel.enabled !== false);
                    setChannels(enabled);
                    setActiveIndex((prev) => Math.min(prev, Math.max(0, enabled.length - 1)));
                }
            } catch (e) {
                console.error("Failed to load live video channels", e);
            }
        };

        const handleRefresh = () => {
            loadChannels();
        };

        loadChannels();
        window.addEventListener("focus", handleRefresh);
        window.addEventListener("sb-live-video-updated", handleRefresh as EventListener);

        return () => {
            cancelled = true;
            window.removeEventListener("focus", handleRefresh);
            window.removeEventListener("sb-live-video-updated", handleRefresh as EventListener);
        };
    }, []);

    useEffect(() => {
        if (isMinimized) return;
        const refreshWhenOpened = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/settings/live-video-channels`, { cache: "no-store" });
                if (!res.ok) return;
                const json = await res.json();
                if (Array.isArray(json)) {
                    const enabled = json.filter((channel) => channel.enabled !== false);
                    setChannels(enabled);
                    setActiveIndex((prev) => Math.min(prev, Math.max(0, enabled.length - 1)));
                }
            } catch (e) {
                console.error("Failed to refresh live video channels", e);
            }
        };
        refreshWhenOpened();
    }, [isMinimized]);

    const activeChannel = channels[activeIndex];

    useEffect(() => {
        let cancelled = false;
        const resolveEmbedUrl = async () => {
            if (!activeChannel?.youtube_url) {
                setActiveEmbedUrl("");
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/youtube/embed-url?url=${encodeURIComponent(activeChannel.youtube_url)}`, { cache: "no-store" });
                if (!res.ok) return;
                const json = await res.json();
                if (!cancelled) {
                    setActiveEmbedUrl(json.embed_url || activeChannel.youtube_url);
                }
            } catch (e) {
                console.error("Failed to resolve YouTube embed URL", e);
                if (!cancelled) {
                    setActiveEmbedUrl(activeChannel.youtube_url);
                }
            }
        };
        resolveEmbedUrl();
        return () => { cancelled = true; };
    }, [activeChannel]);

    return (
        <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className={`w-full flex flex-col bg-[var(--bg-primary)]/40 backdrop-blur-md border border-[var(--border-primary)] rounded-xl pointer-events-auto shadow-[0_4px_30px_rgba(0,0,0,0.2)] relative overflow-hidden ${isMinimized ? "flex-shrink-0" : "max-h-[30rem]"}`}
        >
            <div
                className="flex items-center justify-between p-3 border-b border-[var(--border-primary)]/50 cursor-pointer hover:bg-[var(--bg-secondary)]/50 transition-colors"
                onClick={() => setIsMinimized(!isMinimized)}
            >
                <div className="flex items-center gap-2 text-cyan-400">
                    <Tv size={14} />
                    <span className="text-xs tracking-widest font-bold font-mono">LIVE YOUTUBE NEWS</span>
                </div>
                <button className="text-cyan-500 hover:text-[var(--text-primary)] transition-colors">
                    {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
            </div>

            <AnimatePresence>
                {!isMinimized && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-3 p-3"
                    >
                        {channels.length === 0 ? (
                            <div className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-primary)]/40 rounded-md px-3 py-4 text-center">
                                NO LIVE VIDEO CHANNELS CONFIGURED
                            </div>
                        ) : (
                            <>
                        <div className="grid grid-cols-1 gap-2">
                            {channels.map((channel, idx) => {
                                const isActive = idx === activeIndex;
                                return (
                                    <button
                                        key={`${channel.name}-${idx}`}
                                        onClick={() => setActiveIndex(idx)}
                                        className={`w-full text-left rounded-md border px-3 py-2 transition-colors font-mono ${
                                            isActive
                                                ? "border-cyan-500/60 bg-cyan-950/30 text-cyan-300"
                                                : "border-[var(--border-primary)] bg-black/20 text-[var(--text-secondary)] hover:border-cyan-800/60 hover:text-cyan-300"
                                        }`}
                                    >
                                        <div className="text-[10px] tracking-widest font-bold">{channel.name.toUpperCase()}</div>
                                        <div className="text-[9px] opacity-70 mt-1">{channel.region}</div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="relative w-full h-52 bg-black rounded-md overflow-hidden border border-cyan-900/40">
                            {activeEmbedUrl ? (
                                <iframe
                                    key={`${activeChannel.name}-${activeIndex}-${activeEmbedUrl}`}
                                    src={activeEmbedUrl}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    className="w-full h-full bg-black"
                                    title={activeChannel.name}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-[var(--text-muted)]">
                                    RESOLVING YOUTUBE STREAM...
                                </div>
                            )}
                            <div className="absolute top-2 left-2 text-[8px] text-cyan-400 bg-black/70 px-2 py-1 rounded font-mono tracking-widest">
                                YT LIVE // {activeChannel.name.toUpperCase()}
                            </div>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[10px] font-mono font-bold tracking-widest text-cyan-300">
                                    {activeChannel.name.toUpperCase()}
                                </div>
                                <div className="text-[9px] text-[var(--text-muted)] font-mono mt-1 leading-relaxed">
                                    {activeChannel.region}
                                </div>
                            </div>
                            <a
                                href={activeChannel.youtube_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-cyan-800/60 px-2 py-1 text-[9px] font-mono tracking-widest text-cyan-300 hover:bg-cyan-950/30 transition-colors whitespace-nowrap"
                            >
                                <ExternalLink size={10} />
                                OPEN
                            </a>
                        </div>

                        <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-wide border-t border-[var(--border-primary)]/50 pt-2">
                            Add or edit channels from SETTINGS → LIVE VIDEO. Best results come from YouTube `watch?v=...` or `/channel/.../live` links.
                        </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
