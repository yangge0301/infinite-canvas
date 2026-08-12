"use client";

import { Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasVideoCandidate, CanvasVideoCandidateBatch } from "../types";

type CanvasVideoCandidatePickerProps = {
    node: CanvasNodeData;
    batches: CanvasVideoCandidateBatch[];
    onSelect: (candidate: CanvasVideoCandidate) => void;
    onClose: () => void;
};

export function CanvasVideoCandidatePicker({ node, batches, onSelect, onClose }: CanvasVideoCandidatePickerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const candidates = batches
        .flatMap((batch, batchIndex) =>
            batch.items
                .filter((candidate) => candidate.status === "success" && candidate.content)
                .map((candidate, itemIndex) => ({ batch, batchIndex, candidate, itemIndex })),
        )
        .sort((left, right) => right.batch.createdAt - left.batch.createdAt || right.batchIndex - left.batchIndex);

    return (
        <section
            data-canvas-no-zoom
            className="absolute z-[90] w-[min(720px,calc(100vw-48px))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl"
            style={{
                left: node.position.x + node.width + 28,
                top: node.position.y,
                background: `${theme.toolbar.panel}f4`,
                borderColor: theme.toolbar.border,
                color: theme.node.text,
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <header className="mb-3 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: theme.toolbar.activeBg }}>
                        <Video className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">选择视频</h2>
                        <p className="text-xs opacity-55">选择后会替换当前视频节点</p>
                    </div>
                </div>
                <button type="button" className="flex size-8 cursor-pointer items-center justify-center rounded-lg opacity-60 transition hover:opacity-100" aria-label="关闭视频选择" onClick={onClose}>
                    <X className="size-4" />
                </button>
            </header>

            <div className="thin-scrollbar max-h-[min(64vh,430px)] overflow-y-auto pr-1">
                <div className="flex flex-wrap items-start gap-3">
                    {candidates.map(({ batch, batchIndex, candidate, itemIndex }) => (
                        <article key={candidate.id} className="w-[218px] max-w-full">
                            <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2 text-[11px] font-medium opacity-65">
                                <span className="shrink-0">第 {batchIndex + 1} 次生成{batch.items.length > 1 ? ` · ${itemIndex + 1}` : ""}</span>
                                {batch.createdAt ? <time className="truncate opacity-70" dateTime={new Date(batch.createdAt).toISOString()} suppressHydrationWarning>{formatCreatedAt(batch.createdAt)}</time> : null}
                            </div>
                            <button
                                type="button"
                                className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:border-[#2f80ff]"
                                style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                                onClick={() => onSelect(candidate)}
                            >
                                <video src={candidate.content} muted playsInline preload="metadata" className="pointer-events-none block size-full bg-black object-cover" />
                                <span className="absolute inset-0 flex items-center justify-center bg-black/18 text-white opacity-0 transition group-hover:opacity-100"><Video className="size-6" /></span>
                                <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/75 px-2 py-1.5 text-center text-[11px] font-medium text-white transition-transform group-hover:translate-y-0">替换当前视频</span>
                            </button>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function formatCreatedAt(createdAt: number) {
    return new Date(createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
