"use client";

import { Input } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { firstAllowed, type ModelCapabilityConfig } from "@/lib/model-capabilities";
import { normalizeSeedanceRatio } from "@/lib/seedance-video";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "../types";

const ratioOptions = [
    { value: "21:9", width: 21, height: 9 },
    { value: "16:9", width: 16, height: 9 },
    { value: "9:16", width: 9, height: 16 },
    { value: "4:3", width: 4, height: 3 },
    { value: "3:4", width: 3, height: 4 },
    { value: "1:1", width: 1, height: 1 },
] as const;

const qualityOptions = [
    { value: "480p", label: "480P" },
    { value: "720p", label: "720P" },
    { value: "768p", label: "768P" },
    { value: "1080p", label: "1080P" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
] as const;

const bitrateOptions = [
    { value: "standard", label: "标准码率" },
    { value: "high", label: "高码率" },
] as const;

type CanvasNodeVideoSettingsPanelProps = {
    config: AiConfig;
    metadata?: CanvasNodeMetadata;
    theme: CanvasTheme;
    audioSupported: boolean;
    capability: ModelCapabilityConfig;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio", value: string) => void;
    onMetadataChange?: (patch: Partial<CanvasNodeMetadata>) => void;
};

export function CanvasNodeVideoSettingsPanel({ config, metadata, theme, audioSupported, capability, onConfigChange, onMetadataChange }: CanvasNodeVideoSettingsPanelProps) {
    const fixedDuration = capability.fixedDuration;
    const durationOptions = capability.durationOptions;
    const maxSeconds = capability.maxSeconds || 15;
    const seconds = fixedDuration ? Number(firstAllowed(config.videoSeconds, durationOptions, durationOptions[0] || "5")) : normalizeSeconds(config.videoSeconds, maxSeconds);
    const ratio = firstAllowed(normalizeSeedanceRatio(config.size), capability.ratios, capability.ratios[0] || "16:9");
    const resolution = firstAllowed(normalizeResolution(config.vquality), capability.videoQualities, capability.videoQualities[0] || "720p");
    const audioEnabled = capability.videoGenerateAudio && config.videoGenerateAudio === "true";
    const bitrate = metadata?.videoBitrate || "high";

    return (
        <div className="space-y-5" style={{ color: theme.node.text }}>
            <section className="space-y-3">
                <h3 className="text-base font-semibold">时长 {seconds}S</h3>
                {fixedDuration ? <SegmentedOptions options={durationOptions.map((value) => ({ value, label: `${value}S` }))} selected={String(seconds)} theme={theme} onSelect={(value) => onConfigChange("videoSeconds", value)} /> : <div className="flex items-center gap-3"><input type="range" min={1} max={maxSeconds} step={1} value={seconds} aria-label="视频时长" className="h-2 min-w-0 flex-1 cursor-pointer accent-white" onMouseDown={(event) => event.stopPropagation()} onChange={(event) => onConfigChange("videoSeconds", String(Number(event.target.value)))} /><Input type="number" min={1} max={maxSeconds} value={seconds} aria-label="视频时长" className="!h-11 !w-[128px] !rounded-xl" suffix="S" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => onConfigChange("videoSeconds", String(clampSeconds(event.target.value, maxSeconds)))} /></div>}
            </section>

            <section className="space-y-2.5">
                <SectionTitle>比例</SectionTitle>
                <div className="grid grid-cols-6 gap-1.5 rounded-2xl p-2" style={{ background: theme.node.fill }}>
                    {ratioOptions.filter((item) => capability.ratios.includes(item.value)).map((item) => {
                        const selected = ratio === item.value;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                className="flex min-h-[94px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-1 text-sm font-medium transition hover:opacity-90"
                                style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: selected ? theme.node.text : theme.node.muted }}
                                onClick={() => onConfigChange("size", sizeForRatio(item.value, resolution))}
                            >
                                <AspectIcon width={item.width} height={item.height} color={selected ? theme.node.text : theme.node.muted} />
                                <span>{item.value}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-2.5">
                <SectionTitle>画质</SectionTitle>
                <SegmentedOptions options={qualityOptions.filter((item) => capability.videoQualities.includes(item.value))} selected={resolution} theme={theme} onSelect={(value) => onConfigChange("vquality", value)} />
            </section>

            <section className="space-y-2.5">
                <SectionTitle>音频</SectionTitle>
                <SegmentedOptions options={[{ value: "true", label: "开启" }, { value: "false", label: "关闭" }]} selected={audioEnabled ? "true" : "false"} theme={theme} disabled={!capability.videoGenerateAudio || !audioSupported} onSelect={(value) => onConfigChange("videoGenerateAudio", value)} />
                {!capability.videoGenerateAudio || !audioSupported ? <p className="text-xs" style={{ color: theme.node.muted }}>当前模型未配置生成音频。</p> : null}
            </section>

            <section className="space-y-2.5">
                <SectionTitle>码率</SectionTitle>
                <SegmentedOptions options={bitrateOptions} selected={bitrate} theme={theme} onSelect={(value) => onMetadataChange?.({ videoBitrate: value })} />
                <p className="text-xs" style={{ color: theme.node.muted }}>该选项会保存在视频节点中；当前连接的视频接口暂未提供码率字段。</p>
            </section>
        </div>
    );
}

function SegmentedOptions<T extends string>({ options, selected, theme, disabled = false, onSelect }: { options: readonly { value: T; label: string }[]; selected: T; theme: CanvasTheme; disabled?: boolean; onSelect: (value: T) => void }) {
    return (
        <div className="grid grid-flow-col auto-cols-fr gap-1.5 rounded-2xl p-2" style={{ background: theme.node.fill }}>
            {options.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    disabled={disabled}
                    className="h-12 cursor-pointer rounded-xl px-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                    style={{ background: selected === item.value ? theme.toolbar.activeBg : "transparent", color: selected === item.value ? theme.node.text : theme.node.muted }}
                    onClick={() => onSelect(item.value)}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

function SectionTitle({ children }: { children: string }) {
    return <h3 className="text-base font-semibold">{children}</h3>;
}

function AspectIcon({ width, height, color }: { width: number; height: number; color: string }) {
    const ratio = width / height;
    const iconWidth = ratio >= 1 ? 32 : Math.max(9, 32 * ratio);
    const iconHeight = ratio >= 1 ? Math.max(9, 32 / ratio) : 32;
    return <span className="rounded-[3px] border-2" style={{ width: iconWidth, height: iconHeight, borderColor: color }} />;
}

function normalizeSeconds(value: string, maxSeconds: number) {
    return clampSeconds(value || "1", maxSeconds);
}

function clampSeconds(value: string, maxSeconds: number) {
    return Math.max(1, Math.min(maxSeconds, Math.floor(Number(value) || 1)));
}

function normalizeResolution(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "480" || normalized === "480p" || normalized === "low") return "480p";
    if (normalized === "768" || normalized === "768p") return "768p";
    if (normalized === "1080" || normalized === "1080p") return "1080p";
    if (normalized === "2k") return "2k";
    if (normalized === "4k") return "4k";
    return "720p";
}

function sizeForRatio(ratio: string, resolution: string) {
    const longEdge = { "480p": 864, "720p": 1280, "768p": 1366, "1080p": 1920, "2k": 2560, "4k": 3840 }[resolution] || 1280;
    const [width, height] = ratio.split(":").map(Number);
    if (!width || !height) return "1280x720";
    if (width >= height) return `${longEdge}x${Math.max(16, Math.round((longEdge * height) / width / 16) * 16)}`;
    return `${Math.max(16, Math.round((longEdge * width) / height / 16) * 16)}x${longEdge}`;
}
