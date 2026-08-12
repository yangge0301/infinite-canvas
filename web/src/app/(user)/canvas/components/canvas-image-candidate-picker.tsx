"use client";

import { Image as ImageIcon, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasImageCandidate, CanvasImageCandidateBatch, CanvasNodeData } from "../types";

type CanvasImageCandidatePickerProps = {
    node: CanvasNodeData;
    batches: CanvasImageCandidateBatch[];
    onSelect: (candidate: CanvasImageCandidate) => void;
    onClose: () => void;
};

export function CanvasImageCandidatePicker({ node, batches, onSelect, onClose }: CanvasImageCandidatePickerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const candidates = batches.flatMap((batch, batchIndex) => batch.items.map((candidate, itemIndex) => ({ batch, batchIndex, candidate, itemIndex })));

    return (
        <section
            data-canvas-no-zoom
            className="absolute z-[90] w-[min(620px,calc(100vw-48px))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl"
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
                        <ImageIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">选择图片</h2>
                        <p className="text-xs opacity-55">选择后会替换当前图片节点</p>
                    </div>
                </div>
                <button type="button" className="flex size-8 items-center justify-center rounded-lg opacity-60 transition hover:opacity-100" aria-label="关闭图片选择" onClick={onClose}>
                    <X className="size-4" />
                </button>
            </header>

            <div className="thin-scrollbar max-h-[min(64vh,430px)] overflow-y-auto pr-1">
                <div className="flex flex-wrap items-start gap-3">
                    {candidates.map(({ batch, batchIndex, candidate, itemIndex }) => (
                        <article key={candidate.id} className="w-[178px] max-w-full">
                            <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2 text-[11px] font-medium opacity-65">
                                <span className="shrink-0">第 {batchIndex + 1} 次生成{batch.items.length > 1 ? ` · ${itemIndex + 1}` : ""}</span>
                                {batch.createdAt ? <time className="truncate opacity-70" dateTime={new Date(batch.createdAt).toISOString()} suppressHydrationWarning>{formatCreatedAt(batch.createdAt)}</time> : null}
                            </div>
                            <button
                                type="button"
                                disabled={!candidate.content}
                                className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:border-[#2f80ff] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                                onClick={() => candidate.content && onSelect(candidate)}
                            >
                                {candidate.content ? <img src={candidate.content} alt={`第 ${batchIndex + 1} 次生成图片 ${itemIndex + 1}`} className="block size-full object-cover" /> : <CandidateStatus candidate={candidate} />}
                                {candidate.content ? <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-1.5 text-center text-[11px] font-medium text-white transition-transform group-hover:translate-y-0">替换当前图片</span> : null}
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

function CandidateStatus({ candidate }: { candidate: CanvasImageCandidate }) {
    const label = candidate.status === "loading" ? "生成中…" : candidate.status === "error" ? "生成失败" : "暂无图片";
    return <span className="flex size-full items-center justify-center px-3 text-center text-xs opacity-50">{label}</span>;
}
