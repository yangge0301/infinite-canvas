"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";

const canvasControlSelector = "[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown";

function isCanvasControl(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    if (target.closest(".ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return true;
    if (target.closest("[data-node-id]")) return false;
    return Boolean(target.closest(canvasControlSelector));
}

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const onViewportChangeRef = useRef(onViewportChange);
    const onCanvasDeselectRef = useRef(onCanvasDeselect);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const wheelFrameRef = useRef<number | null>(null);
    const nextWheelViewportRef = useRef<ViewportTransform | null>(null);
    const gestureScaleRef = useRef(1);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        scaleRef.current = viewport.k;
        viewportRef.current = viewport;
    }, [viewport]);

    useEffect(() => {
        onViewportChangeRef.current = onViewportChange;
        onCanvasDeselectRef.current = onCanvasDeselect;
    }, [onCanvasDeselect, onViewportChange]);

    const scheduleViewportChange = useCallback((nextViewport: ViewportTransform) => {
        scaleRef.current = nextViewport.k;
        viewportRef.current = nextViewport;
        nextWheelViewportRef.current = nextViewport;
        if (wheelFrameRef.current) return;
        wheelFrameRef.current = requestAnimationFrame(() => {
            wheelFrameRef.current = null;
            if (nextWheelViewportRef.current) onViewportChangeRef.current(nextWheelViewportRef.current);
        });
    }, []);

    const zoomAtPoint = useCallback((factor: number, clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || !Number.isFinite(factor)) return;

        const currentViewport = viewportRef.current;
        const newScale = Math.min(Math.max(currentViewport.k * factor, 0.05), 5);
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const worldX = (mouseX - currentViewport.x) / currentViewport.k;
        const worldY = (mouseY - currentViewport.y) / currentViewport.k;
        const nextViewport = {
            x: mouseX - worldX * newScale,
            y: mouseY - worldY * newScale,
            k: newScale,
        };

        scheduleViewportChange(nextViewport);
    }, [containerRef, scheduleViewportChange]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (wheelFrameRef.current) cancelAnimationFrame(wheelFrameRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");

        if (event.button === 1 || (event.button === 0 && isSpacePressed && isBackgroundClick)) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
            };
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && !isSpacePressed && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;
            if (event.buttons === 0) {
                panState.current.isPanning = false;
                document.body.style.cursor = "";
                return;
            }
            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChangeRef.current(nextViewportRef.current);
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved) {
                onCanvasDeselectRef.current?.();
            }
            panState.current.isPanning = false;
            document.body.style.cursor = "default";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (event: WheelEvent) => {
            if (isCanvasControl(event.target)) return;
            event.preventDefault();
            if (!event.ctrlKey && !event.metaKey) {
                const currentViewport = viewportRef.current;
                const nextViewport = { x: currentViewport.x - event.deltaX, y: currentViewport.y - event.deltaY, k: currentViewport.k };
                scheduleViewportChange(nextViewport);
                return;
            }

            // macOS trackpad pinch is delivered as a ctrl/meta wheel gesture.
            const rect = container.getBoundingClientRect();
            const currentViewport = viewportRef.current;
            const newScale = Math.min(Math.max(currentViewport.k * Math.pow(1.45, -event.deltaY / 100), 0.05), 5);
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const worldX = (mouseX - currentViewport.x) / currentViewport.k;
            const worldY = (mouseY - currentViewport.y) / currentViewport.k;
            scheduleViewportChange({ x: mouseX - worldX * newScale, y: mouseY - worldY * newScale, k: newScale });
        };
        container.addEventListener("wheel", handleWheel, { passive: false, capture: true });
        return () => container.removeEventListener("wheel", handleWheel, { capture: true });
    }, [containerRef, scheduleViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventBrowserGestureZoom = (event: Event) => {
            event.preventDefault();
        };
        const handleGestureStart = (event: Event) => {
            preventBrowserGestureZoom(event);
            gestureScaleRef.current = (event as Event & { scale?: number }).scale || 1;
        };
        const handleGestureChange = (event: Event) => {
            preventBrowserGestureZoom(event);
            if (isCanvasControl(event.target)) return;

            const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
            const nextGestureScale = gesture.scale || 1;
            const factor = Math.pow(nextGestureScale / gestureScaleRef.current, 1.75);
            gestureScaleRef.current = nextGestureScale;
            const rect = container.getBoundingClientRect();
            zoomAtPoint(factor, gesture.clientX ?? rect.left + rect.width / 2, gesture.clientY ?? rect.top + rect.height / 2);
        };

        container.addEventListener("gesturestart", handleGestureStart, { passive: false, capture: true });
        container.addEventListener("gesturechange", handleGestureChange, { passive: false, capture: true });
        container.addEventListener("gestureend", preventBrowserGestureZoom, { passive: false, capture: true });
        return () => {
            container.removeEventListener("gesturestart", handleGestureStart, { capture: true });
            container.removeEventListener("gesturechange", handleGestureChange, { capture: true });
            container.removeEventListener("gestureend", preventBrowserGestureZoom, { capture: true });
        };
    }, [containerRef, zoomAtPoint]);

    return (
        <div
            ref={containerRef}
            className={`relative h-full w-full select-none overflow-hidden ${isSpacePressed ? "cursor-grab" : "cursor-default"}`}
            style={{ background: theme.canvas.background }}
            onPointerDown={handlePointerDown}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`, "--canvas-inverse-scale": 1 / viewport.k } as React.CSSProperties}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
