"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button, Switch, Tooltip } from "antd";

import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { isKIESeedreamLayerDecompositionModel } from "@/lib/kie-models";
import { modelCapabilityFor } from "@/lib/model-capabilities";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeImageSettingsPanel, canvasNodeImageSettingsLabel } from "./canvas-node-image-settings-panel";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
    showSize?: boolean;
    showCount?: boolean;
    buttonIcon?: ReactNode;
    variant?: "default" | "node";
    canvasScale?: number;
    positionVersion?: string;
    reuseImageAsReference?: boolean;
    onReuseImageAsReferenceChange?: (value: boolean) => void;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft", showSize = true, showCount = true, buttonIcon, variant = "default", canvasScale = 1, positionVersion, reuseImageAsReference, onReuseImageAsReferenceChange }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const capability = modelCapabilityFor(modelCosts, config.model);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const layerDecomposition = isKIESeedreamLayerDecompositionModel(config.model);
    const effectiveShowSize = showSize && !layerDecomposition;
    const effectiveShowCount = showCount && !layerDecomposition;
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [canvasScale, onOpenChange, open, positionVersion]);

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} capability={capability} onConfigChange={onConfigChange} showSize={effectiveShowSize} showCount={effectiveShowCount} variant={variant} canvasScale={canvasScale} reuseImageAsReference={reuseImageAsReference} onReuseImageAsReferenceChange={onReuseImageAsReferenceChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"} style={{ background: theme.node.fill, color: theme.node.text }} icon={buttonIcon || <Settings2 className="size-3.5" />} onClick={() => updateOpen(!open)}>
                    <span className="truncate">
                        {effectiveShowSize ? (
                            <>
                                {imageQualityLabel(quality)} · {variant === "node" ? canvasNodeImageSettingsLabel(activeSize) : imageSizeLabel(activeSize)}
                                {effectiveShowCount ? <> · {count} 张</> : null}
                            </>
                        ) : (
                            <>
                                {imageQualityLabel(quality)}
                                {effectiveShowCount ? <> · {count} 张</> : null}
                            </>
                        )}
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    capability,
    onConfigChange,
    showSize,
    showCount,
    variant,
    canvasScale,
    reuseImageAsReference,
    onReuseImageAsReferenceChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    capability: ReturnType<typeof modelCapabilityFor>;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    showSize: boolean;
    showCount: boolean;
    variant: NonNullable<CanvasImageSettingsPopoverProps["variant"]>;
    canvasScale: number;
    reuseImageAsReference?: boolean;
    onReuseImageAsReferenceChange?: (value: boolean) => void;
}) {
    const width = variant === "node" ? 640 : 356;
    const gap = 8;
    const margin = 12;
    const scale = Math.max(0.35, Math.min(1.5, canvasScale));
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const visualWidth = width * scale;
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - visualWidth / 2 : alignRight ? buttonRect.right - visualWidth : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const availableHeight = topPlacement ? buttonRect.top - margin * 2 : window.innerHeight - buttonRect.bottom - margin * 2;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - visualWidth - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap * scale } : { top: buttonRect.bottom + gap * scale }),
        maxHeight: Math.max(260, availableHeight / scale),
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
        transform: `scale(${scale})`,
        transformOrigin: topPlacement ? "bottom left" : "top left",
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {variant === "node" ? (
                <CanvasNodeImageSettingsPanel config={config} capability={capability} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} showSize={showSize} showCount={showCount} reuseImageAsReference={reuseImageAsReference} onReuseImageAsReferenceChange={onReuseImageAsReferenceChange} />
            ) : (
                <ImageSettingsPanel
                    config={config}
                    capability={capability}
                    onConfigChange={(key, value) => onConfigChange(key, value)}
                    theme={theme}
                    className="space-y-4"
                    showSize={showSize}
                    showCount={showCount}
                    titleAccessory={onReuseImageAsReferenceChange ? (
                        <Tooltip title="开启后，重复生成会把当前图片作为参考；关闭时仅使用提示词和已连接的素材">
                            <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: theme.node.fill }}>
                                <div>
                                    <div className="text-sm font-medium">保持当前图一致</div>
                                    <div className="mt-0.5 text-xs" style={{ color: theme.node.muted }}>重复生成时将当前图片作为参考</div>
                                </div>
                                <Switch size="small" checked={Boolean(reuseImageAsReference)} aria-label="保持当前图一致" onChange={onReuseImageAsReferenceChange} />
                            </div>
                        </Tooltip>
                    ) : null}
                />
            )}
        </div>,
        document.body,
    );
}
