"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Move } from "lucide-react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

import { canvasThemes } from "@/lib/canvas-theme";
import { getProxyUrl } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { registerPanoramaCapture } from "../utils/canvas-panorama-capture";

type CanvasPanoramaViewerProps = {
    src: string;
    alt: string;
    captureId?: string;
    proxyGeneratedPanorama?: boolean;
    expandOnDoubleClick?: boolean;
    immersive?: boolean;
    onMoveStart?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    onOpen?: () => void;
};

type PanoramaSurfaceProps = {
    src: string;
    alt: string;
    captureId?: string;
    proxyGeneratedPanorama: boolean;
    viewerEntry: PanoramaViewerEntry;
};

const MAX_ACTIVE_PANORAMA_VIEWERS = 4;

type PanoramaViewerEntry = {
    setActive: (active: boolean) => void;
};

const activePanoramaViewers: PanoramaViewerEntry[] = [];

function registerPanoramaViewer(entry: PanoramaViewerEntry) {
    if (activePanoramaViewers.includes(entry)) return true;
    if (activePanoramaViewers.length >= MAX_ACTIVE_PANORAMA_VIEWERS) {
        entry.setActive(false);
        return false;
    }

    activePanoramaViewers.push(entry);
    entry.setActive(true);
    return true;
}

function activatePanoramaViewer(entry: PanoramaViewerEntry) {
    const index = activePanoramaViewers.indexOf(entry);
    if (index >= 0) activePanoramaViewers.splice(index, 1);

    activePanoramaViewers.push(entry);
    entry.setActive(true);

    if (activePanoramaViewers.length > MAX_ACTIVE_PANORAMA_VIEWERS) {
        activePanoramaViewers.shift()?.setActive(false);
    }
}

function releasePanoramaViewer(entry: PanoramaViewerEntry) {
    const index = activePanoramaViewers.indexOf(entry);
    if (index >= 0) activePanoramaViewers.splice(index, 1);
}

function resolvePanoramaSrc(src: string) {
    if (!src.startsWith("http://") && !src.startsWith("https://")) return src;

    try {
        const parsed = new URL(src, window.location.href);
        if (
            parsed.pathname.startsWith("/api/media/generated/") ||
            parsed.pathname.startsWith("/api/files/") ||
            parsed.origin === window.location.origin
        ) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch {
        return src;
    }

    return getProxyUrl(src);
}

function PanoramaSurface({ src, alt, captureId, proxyGeneratedPanorama, viewerEntry }: PanoramaSurfaceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const fallbackImageRef = useRef<HTMLImageElement>(null);
    const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
    const [status, setStatus] = useState<"loading" | "fallback" | "ready" | "error">("loading");
    const [fallbackOffset, setFallbackOffset] = useState({ x: 0, y: 0 });
    const panoramaSrc = resolvePanoramaSrc(proxyGeneratedPanorama ? getProxyUrl(src) : src);

    useEffect(() => {
        if (!captureId) return;
        return registerPanoramaCapture(captureId, () => {
            const viewerCanvas = containerRef.current?.querySelector<HTMLCanvasElement>(".psv-canvas");
            if (status === "ready" && viewerCanvas) {
                try {
                    return viewerCanvas.toDataURL("image/png");
                } catch (error) {
                    console.error("全景图镜头捕获失败", { error });
                }
            }

            const image = fallbackImageRef.current;
            const container = containerRef.current?.parentElement;
            if (!image?.complete || !image.naturalWidth || !container) return null;
            const width = Math.max(1, Math.round(container.clientWidth));
            const height = Math.max(1, Math.round(container.clientHeight));
            const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) return null;
            context.fillStyle = "#000";
            context.fillRect(0, 0, width, height);
            context.drawImage(image, (width - image.naturalWidth * scale) / 2 + fallbackOffset.x, (height - image.naturalHeight * scale) / 2 + fallbackOffset.y, image.naturalWidth * scale, image.naturalHeight * scale);
            return canvas.toDataURL("image/png");
        });
    }, [captureId, fallbackOffset, status]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        if (!registerPanoramaViewer(viewerEntry)) return;
        setStatus("loading");
        let viewer: Viewer | null = null;
        let disposed = false;
        let loadTimeout: ReturnType<typeof setTimeout> | null = null;
        const fallbackImage = new Image();

        function handlePanoramaLoaded() {
            if (disposed) return;
            if (loadTimeout) clearTimeout(loadTimeout);
            setStatus("ready");
        }

        function handleViewerError(error?: unknown) {
            if (disposed) return;
            disposed = true;
            if (loadTimeout) clearTimeout(loadTimeout);
            console.error("全景图查看器加载失败", { src: panoramaSrc, error });
            setStatus("fallback");
            destroyAndReleaseViewer();
        }

        function handleImageError(error?: unknown) {
            if (disposed) return;
            disposed = true;
            console.error("全景图图片加载失败", { src: panoramaSrc, error });
            setStatus("error");
            releasePanoramaViewer(viewerEntry);
        }

        function destroyViewer() {
            const currentViewer = viewer;
            if (!currentViewer) return;
            viewer = null;
            currentViewer.removeEventListener("panorama-loaded", handlePanoramaLoaded);
            currentViewer.removeEventListener("panorama-error", handleViewerError);
            const contextLoss = currentViewer.container.querySelector<HTMLCanvasElement>(".psv-canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
            try {
                currentViewer.destroy();
            } finally {
                contextLoss?.loseContext();
            }
        }

        function destroyAndReleaseViewer() {
            try {
                destroyViewer();
            } finally {
                releasePanoramaViewer(viewerEntry);
            }
        }

        function startViewer() {
            if (disposed) return;
            setStatus("fallback");
            try {
                viewer = new Viewer({
                    container,
                    navbar: false,
                    mousewheel: false,
                    mousemove: true,
                    touchmoveTwoFingers: false,
                    moveInertia: false,
                    defaultZoomLvl: 50,
                    minFov: 25,
                    maxFov: 110,
                    rendererParameters: { alpha: true, antialias: true, preserveDrawingBuffer: true },
                });
                viewer.addEventListener("panorama-loaded", handlePanoramaLoaded);
                viewer.addEventListener("panorama-error", handleViewerError);
                loadTimeout = setTimeout(() => handleViewerError(new Error("全景图查看器加载超时")), 15_000);
                void viewer.setPanorama(panoramaSrc).then((loaded) => {
                    if (loaded) handlePanoramaLoaded();
                }).catch(handleViewerError);
            } catch (error) {
                console.error("全景图查看器初始化失败", { src: panoramaSrc, error });
                handleViewerError(error);
            }
        }

        fallbackImage.onload = startViewer;
        fallbackImage.onerror = handleImageError;
        fallbackImage.src = panoramaSrc;

        return () => {
            disposed = true;
            if (loadTimeout) clearTimeout(loadTimeout);
            fallbackImage.onload = null;
            fallbackImage.onerror = null;
            destroyViewer();
        };
    }, [panoramaSrc, viewerEntry]);

    const handleFallbackPointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
        if (status === "ready" || status === "loading") return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: fallbackOffset.x, offsetY: fallbackOffset.y };
    };

    const handleFallbackPointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setFallbackOffset({ x: drag.offsetX + event.clientX - drag.x, y: drag.offsetY + event.clientY - drag.y });
    };

    const handleFallbackPointerUp = (event: ReactPointerEvent<HTMLImageElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div className="relative h-full w-full overflow-hidden">
            {status !== "ready" && status !== "loading" ? (
                <img
                    ref={fallbackImageRef}
                    src={panoramaSrc}
                    alt={alt}
                    draggable={false}
                    onPointerDown={handleFallbackPointerDown}
                    onPointerMove={handleFallbackPointerMove}
                    onPointerUp={handleFallbackPointerUp}
                    onPointerCancel={handleFallbackPointerUp}
                    className="absolute inset-0 h-full w-full select-none object-contain"
                    style={{ transform: `translate3d(${fallbackOffset.x}px, ${fallbackOffset.y}px, 0)`, cursor: status === "fallback" ? "grab" : "default" }}
                />
            ) : null}
            <div ref={containerRef} className="absolute inset-0 transition-opacity duration-200" style={{ opacity: status === "ready" ? 1 : 0, pointerEvents: status === "ready" ? "auto" : "none" }} />
            {status === "loading" ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 text-xs text-white/80">正在加载全景图...</div> : null}
            {status === "error" ? <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80">图片加载失败</div> : null}
        </div>
    );
}

export default function CanvasPanoramaViewer({ src, alt, captureId, proxyGeneratedPanorama = false, expandOnDoubleClick = false, immersive = false, onMoveStart, onOpen }: CanvasPanoramaViewerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const controlStyle = { background: theme.toolbar.panel, color: theme.toolbar.item };
    const [active, setActive] = useState<boolean | null>(null);
    const [surfaceKey, setSurfaceKey] = useState(0);
    const viewerEntryRef = useRef<PanoramaViewerEntry>({ setActive });

    useEffect(() => {
        const entry = viewerEntryRef.current;
        if (immersive) activatePanoramaViewer(entry);
        else registerPanoramaViewer(entry);
        return () => releasePanoramaViewer(entry);
    }, [immersive]);

    const activate = () => {
        const entry = viewerEntryRef.current;
        const shouldRetry = active === true && !activePanoramaViewers.includes(entry);
        activatePanoramaViewer(entry);
        if (shouldRetry) setSurfaceKey((current) => current + 1);
    };
    const surface =
        active === null ? null : active ? (
            <PanoramaSurface key={surfaceKey} src={src} alt={alt} captureId={captureId} proxyGeneratedPanorama={proxyGeneratedPanorama} viewerEntry={viewerEntryRef.current} />
        ) : (
            <img src={src} alt={alt} draggable={false} className="pointer-events-none h-full w-full select-none object-contain" />
        );

    if (immersive)
        return (
            <div
                className="h-full w-full overflow-hidden"
                data-canvas-no-zoom
                tabIndex={-1}
                autoFocus
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerEnter={activate}
                onPointerDown={(event) => {
                    activate();
                    event.stopPropagation();
                }}
                onWheel={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                {surface}
            </div>
        );

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            data-canvas-no-zoom
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerEnter={activate}
            onPointerDown={(event) => {
                activate();
                event.stopPropagation();
            }}
            onWheel={(event) => event.stopPropagation()}
            onDoubleClick={(event) => {
                if (!expandOnDoubleClick || !onOpen) return;
                event.stopPropagation();
                onOpen();
            }}
        >
            {surface}
            {onMoveStart ? (
                <button
                    type="button"
                    title="拖动节点"
                    aria-label="拖动节点"
                    className="absolute left-2 top-2 z-20 flex size-7 cursor-grab items-center justify-center rounded-md opacity-70 backdrop-blur transition-opacity hover:opacity-100 active:cursor-grabbing"
                    style={controlStyle}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        onMoveStart(event);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                >
                    <Move className="size-3.5" />
                </button>
            ) : null}
            {onOpen ? (
                <button
                    type="button"
                    title="沉浸式查看"
                    aria-label="沉浸式查看"
                    className="absolute bottom-2 left-2 z-20 flex size-7 items-center justify-center rounded-md opacity-70 backdrop-blur transition-opacity hover:opacity-100"
                    style={controlStyle}
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpen();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                >
                    <Maximize2 className="size-3.5" />
                </button>
            ) : null}
        </div>
    );
}
