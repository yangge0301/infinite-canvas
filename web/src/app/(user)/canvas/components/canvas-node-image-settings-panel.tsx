"use client";

import { Switch } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { firstAllowed, imageQualityOptions, imageRatioOptions, imageResolutionOptions, type ModelCapabilityConfig } from "@/lib/model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";

const ratioOptions = [
    { value: "1:1", width: 1, height: 1 },
    { value: "2:1", width: 2, height: 1 },
    { value: "3:2", width: 3, height: 2 },
    { value: "4:3", width: 4, height: 3 },
    { value: "3:4", width: 3, height: 4 },
    { value: "16:9", width: 16, height: 9 },
    { value: "9:16", width: 9, height: 16 },
    { value: "21:9", width: 21, height: 9 },
    { value: "2:3", width: 2, height: 3 },
    { value: "9:21", width: 9, height: 21 },
];

const resolutionOptions = [
    { value: 1024, label: "1K" },
    { value: 2048, label: "2K" },
    { value: 3840, label: "4K" },
];

const qualityOptions = [
    { value: "low", label: "普通质量" },
    { value: "medium", label: "高质量" },
    { value: "high", label: "超高质量" },
];

type CanvasNodeImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "size" | "count", value: string) => void;
    theme: CanvasTheme;
    showSize: boolean;
    showCount: boolean;
    reuseImageAsReference?: boolean;
    onReuseImageAsReferenceChange?: (value: boolean) => void;
    capability: ModelCapabilityConfig;
};

export function CanvasNodeImageSettingsPanel({ config, onConfigChange, theme, showSize, showCount, reuseImageAsReference, onReuseImageAsReferenceChange, capability }: CanvasNodeImageSettingsPanelProps) {
    const ratios = capability.ratios;
    const resolutions = capability.resolutions;
    const qualities = capability.qualities;
    const selected = resolveSizeSelection(config.size || ratios[0], ratios, resolutions);
    const quality = firstAllowed(config.quality === "auto" ? "medium" : config.quality || "medium", qualities, "medium");
    const maxCount = capability.maxCount || 4;
    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const selectRatio = (ratio: (typeof ratioOptions)[number]) => onConfigChange("size", sizeForRatio(ratio, selected.resolution));
    const selectResolution = (resolution: number) => onConfigChange("size", sizeForRatio(selected.ratio, resolution));

    return (
        <div className="space-y-5" style={{ color: theme.node.text }}>
            {showSize ? (
                <section className="space-y-2.5">
                    <SectionTitle>比例</SectionTitle>
                    <div className="flex gap-1.5 overflow-x-auto rounded-2xl p-2 thin-scrollbar" style={{ background: theme.node.fill }}>
                        {ratioOptions.filter((ratio) => ratios.includes(ratio.value)).map((ratio) => (
                            <button
                                key={ratio.value}
                                type="button"
                                className="flex min-w-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-xs font-medium transition hover:opacity-90"
                                style={{ background: selected.ratio.value === ratio.value ? theme.toolbar.activeBg : "transparent", color: selected.ratio.value === ratio.value ? theme.node.text : theme.node.muted }}
                                onClick={() => selectRatio(ratio)}
                            >
                                <AspectIcon width={ratio.width} height={ratio.height} color={selected.ratio.value === ratio.value ? theme.node.text : theme.node.muted} />
                                <span>{ratio.value}</span>
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}

            {showSize ? (
                <section className="space-y-2.5">
                    <SectionTitle>清晰度</SectionTitle>
                    <SegmentedOptions options={resolutionOptions.filter((item) => resolutions.includes(`${item.value / 1024}k`))} selected={selected.resolution} theme={theme} onSelect={(item) => selectResolution(item.value)} />
                </section>
            ) : null}

            <section className="space-y-2.5">
                <SectionTitle>质量</SectionTitle>
                <SegmentedOptions options={qualityOptions.filter((item) => qualities.includes(item.value))} selected={quality} theme={theme} onSelect={(item) => onConfigChange("quality", item.value)} />
            </section>

            {onReuseImageAsReferenceChange ? (
                <section className="flex items-center justify-between gap-4 rounded-2xl px-3.5 py-3" style={{ background: theme.node.fill }}>
                    <div>
                        <SectionTitle>保持当前图一致</SectionTitle>
                        <p className="mt-1 text-xs" style={{ color: theme.node.muted }}>重复生成时将当前图片作为参考</p>
                    </div>
                    <Switch checked={Boolean(reuseImageAsReference)} aria-label="保持当前图一致" onChange={onReuseImageAsReferenceChange} />
                </section>
            ) : null}

            {showCount ? (
                <section className="space-y-2.5">
                    <SectionTitle>生成张数</SectionTitle>
                    <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_minmax(82px,1.25fr)] gap-1.5 rounded-2xl p-2" style={{ background: theme.node.fill }}>
                        {Array.from({ length: maxCount }, (_, index) => index + 1).map((value) => (
                            <button key={value} type="button" className="h-11 cursor-pointer rounded-xl text-sm font-medium transition hover:opacity-90" style={{ background: count === value ? theme.toolbar.activeBg : "transparent", color: count === value ? theme.node.text : theme.node.muted }} onClick={() => onConfigChange("count", String(value))}>
                                {value} 张
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

export function canvasNodeImageSettingsLabel(size: string) {
    const selection = resolveSizeSelection(size || "1:1", imageRatioOptions, imageResolutionOptions);
    return `${selection.ratio.value} · ${resolutionOptions.find((option) => option.value === selection.resolution)?.label || "1K"}`;
}

function SegmentedOptions<T extends string | number>({ options, selected, theme, onSelect }: { options: { value: T; label: string }[]; selected: T; theme: CanvasTheme; onSelect: (item: { value: T; label: string }) => void }) {
    return (
        <div className="grid grid-flow-col auto-cols-fr gap-1.5 rounded-2xl p-2" style={{ background: theme.node.fill }}>
            {options.map((item) => (
                <button key={item.value} type="button" className="h-12 cursor-pointer rounded-xl px-2 text-sm font-medium transition hover:opacity-90" style={{ background: selected === item.value ? theme.toolbar.activeBg : "transparent", color: selected === item.value ? theme.node.text : theme.node.muted }} onClick={() => onSelect(item)}>
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
    const iconWidth = ratio >= 1 ? 30 : Math.max(9, 30 * ratio);
    const iconHeight = ratio >= 1 ? Math.max(9, 30 / ratio) : 30;
    return <span className="border-2 rounded-[3px]" style={{ width: iconWidth, height: iconHeight, borderColor: color }} />;
}

function resolveSizeSelection(size: string, allowedRatios: string[], allowedResolutions: string[]) {
    const [width, height] = size.split("x").map(Number);
    if (!width || !height) {
        const ratio = ratioOptions.find((item) => item.value === size && allowedRatios.includes(item.value)) || ratioOptions.find((item) => allowedRatios.includes(item.value)) || ratioOptions[0];
        const resolution = allowedResolutions.includes("2k") ? 2048 : allowedResolutions.includes("1k") ? 1024 : 3840;
        return { ratio, resolution };
    }
    const allowed = ratioOptions.filter((item) => allowedRatios.includes(item.value));
    const ratio = allowed.reduce((closest, item) => (Math.abs(width / height - item.width / item.height) < Math.abs(width / height - closest.width / closest.height) ? item : closest), allowed[0] || ratioOptions[0]);
    const resolution = nearestResolution(Math.max(width, height));
    return { ratio, resolution: allowedResolutions.includes(`${resolution / 1024}k`) ? resolution : allowedResolutions.includes("2k") ? 2048 : allowedResolutions.includes("1k") ? 1024 : 3840 };
}

function nearestResolution(value: number) {
    return resolutionOptions.reduce((closest, option) => (Math.abs(option.value - value) < Math.abs(closest - value) ? option.value : closest), resolutionOptions[0].value);
}

function sizeForRatio(ratio: (typeof ratioOptions)[number], longEdge: number) {
    const landscape = ratio.width >= ratio.height;
    const width = landscape ? longEdge : Math.round((longEdge * ratio.width) / ratio.height / 16) * 16;
    const height = landscape ? Math.round((longEdge * ratio.height) / ratio.width / 16) * 16 : longEdge;
    return `${width}x${height}`;
}
