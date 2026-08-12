"use client";

import { Input, Switch } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { normalizeSeedanceRatio } from "@/lib/seedance-video";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "../types";

const ratioOptions = [
    { value: "21:9", width: 21, height: 9 },
    { value: "16:9", width: 16, height: 9 },
    { value: "4:3", width: 4, height: 3 },
    { value: "1:1", width: 1, height: 1 },
    { value: "3:4", width: 3, height: 4 },
    { value: "9:16", width: 9, height: 16 },
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
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio", value: string) => void;
    onMetadataChange?: (patch: Partial<CanvasNodeMetadata>) => void;
};

export function CanvasNodeVideoSettingsPanel({ config, metadata, theme, audioSupported, onConfigChange, onMetadataChange }: CanvasNodeVideoSettingsPanelProps) {
    const customSeconds = Boolean(metadata?.videoCustomSeconds);
    const seconds = normalizeSeconds(config.videoSeconds);
    const ratio = normalizeSeedanceRatio(config.size);
    const resolution = normalizeResolution(config.vquality);
    const audioEnabled = config.videoGenerateAudio === "true";
    const bitrate = metadata?.videoBitrate === "high" ? "high" : "standard";

    return (
        <div className="space-y-5" style={{ color: theme.node.text }}>
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">时长 {seconds}S</h3>
                    <label className="flex items-center gap-2 text-xs font-medium" style={{ color: theme.node.muted }}>
                        自定义
                        <span onMouseDown={(event) => event.stopPropagation()}>
                            <Switch size="small" checked={customSeconds} onChange={(checked) => onMetadataChange?.({ videoCustomSeconds: checked })} />
                        </span>
                    </label>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        value={seconds}
                        disabled={customSeconds}
                        aria-label="视频时长"
                        className="h-2 min-w-0 flex-1 cursor-pointer accent-white disabled:cursor-not-allowed disabled:opacity-35"
                        onMouseDown={(event) => event.stopPropagation()}
                        onChange={(event) => onConfigChange("videoSeconds", String(Number(event.target.value)))}
                    />
                    {customSeconds ? (
                        <Input
                            type="number"
                            min={1}
                            max={30}
                            value={seconds}
                            aria-label="自定义视频时长"
                            className="!h-11 !w-[128px] !rounded-xl"
                            suffix="S"
                            style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onChange={(event) => onConfigChange("videoSeconds", String(clampSeconds(event.target.value)))}
                        />
                    ) : (
                        <span className="flex h-11 w-[128px] items-center justify-center rounded-xl text-lg font-semibold" style={{ background: theme.node.fill }}>
                            {seconds} <small className="ml-1 text-xs font-medium opacity-55">S</small>
                        </span>
                    )}
                </div>
                <p className="text-xs" style={{ color: theme.node.muted }}>{customSeconds ? "已启用输入框时长；不同模型会按其可用时长自动适配。" : "拖动滑块选择时长；默认使用滑块数值。"}</p>
            </section>

            <section className="space-y-2.5">
                <SectionTitle>比例</SectionTitle>
                <div className="grid grid-cols-6 gap-1.5 rounded-2xl p-2" style={{ background: theme.node.fill }}>
                    {ratioOptions.map((item) => {
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
                <SegmentedOptions options={qualityOptions} selected={resolution} theme={theme} onSelect={(value) => onConfigChange("vquality", value)} />
            </section>

            <section className="space-y-2.5">
                <SectionTitle>音频</SectionTitle>
                <SegmentedOptions options={[{ value: "true", label: "开启" }, { value: "false", label: "关闭" }]} selected={audioEnabled ? "true" : "false"} theme={theme} disabled={!audioSupported} onSelect={(value) => onConfigChange("videoGenerateAudio", value)} />
                {!audioSupported ? <p className="text-xs" style={{ color: theme.node.muted }}>当前模型不支持生成音频。</p> : null}
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

function normalizeSeconds(value: string) {
    return clampSeconds(value || "6");
}

function clampSeconds(value: string) {
    return Math.max(1, Math.min(30, Math.floor(Number(value) || 1)));
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
