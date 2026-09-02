"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, ColorPicker, Input, Modal, Slider } from "antd";
import { Brush, Eraser, RotateCcw, Save, Square, WandSparkles, X } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { readImageMeta } from "@/lib/image-utils";
import { downloadRemoteMedia } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasImageMaskEditPayload = {
    prompt: string;
    markedDataUrl: string;
    model: string;
    channelId?: string;
};

type DrawMode = "paint" | "frame" | "erase";

const defaultBrushSize = 15;
const defaultBrushColor = "#2563eb";
const maskBorderColor = "rgba(255, 255, 255, .72)";

export function CanvasNodeMaskEditDialog({
    dataUrl,
    open,
    config,
    model,
    channelId,
    onModelChange,
    onMissingConfig,
    onClose,
    onSave,
    onConfirm,
}: {
    dataUrl: string;
    open: boolean;
    config: AiConfig;
    model: string;
    channelId?: string;
    onModelChange: (model: string, channelId?: string) => void;
    onMissingConfig: () => void;
    onClose: () => void;
    onSave: (markedDataUrl: string) => Promise<void>;
    onConfirm: (payload: CanvasImageMaskEditPayload) => void;
}) {
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const colorCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef<{ active: boolean; start: { x: number; y: number } | null; last: { x: number; y: number } | null }>({ active: false, start: null, last: null });
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [prompt, setPrompt] = useState("");
    const [brushSize, setBrushSize] = useState(defaultBrushSize);
    const [brushColor, setBrushColor] = useState(defaultBrushColor);
    const [mode, setMode] = useState<DrawMode>("paint");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPrompt("");
        setBrushSize(defaultBrushSize);
        setBrushColor(defaultBrushColor);
        setMode("paint");
        setError("");
        setSaving(false);
        setSubmitting(false);
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        clearCanvas(maskCanvasRef.current);
        clearCanvas(colorCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
    }, [image]);

    const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const point = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
        const maskCanvas = maskCanvasRef.current;
        const colorCanvas = colorCanvasRef.current;
        const context = maskCanvas?.getContext("2d");
        const colorContext = colorCanvas?.getContext("2d");
        if (!maskCanvas || !colorCanvas || !context || !colorContext) return;
        if (mode === "frame") {
            const start = drawingRef.current.start;
            if (!start) return;
            renderMaskPreview(maskCanvas, colorCanvas, previewCanvasRef.current);
            drawFramePreview(previewCanvasRef.current, start, point, brushColor, brushSize);
            drawingRef.current.last = point;
            setError("");
            return;
        }
        configureDrawContext(context, brushSize, mode, "#000");
        configureDrawContext(colorContext, brushSize, mode, withMaskAlpha(brushColor));
        if (!drawingRef.current.last) {
            drawMaskStroke(context, point, point, brushSize);
            drawMaskStroke(colorContext, point, point, brushSize);
        } else {
            drawMaskStroke(context, drawingRef.current.last, point, brushSize);
            drawMaskStroke(colorContext, drawingRef.current.last, point, brushSize);
        }
        renderMaskPreview(maskCanvas, colorCanvas, previewCanvasRef.current);
        drawingRef.current.last = point;
        if (mode === "paint") {
            setError("");
        }
    };

    const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = { active: true, start: readCanvasPoint(event.currentTarget, event.clientX, event.clientY), last: null };
        if (maskCanvasRef.current && colorCanvasRef.current) renderMaskPreview(maskCanvasRef.current, colorCanvasRef.current, previewCanvasRef.current);
        draw(event);
    };

    const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current.active) return;
        event.preventDefault();
        draw(event);
    };

    const stopDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current.active) return;
        const maskCanvas = maskCanvasRef.current;
        const colorCanvas = colorCanvasRef.current;
        if (mode === "frame" && maskCanvas && colorCanvas) {
            draw(event);
            const { start, last } = drawingRef.current;
            const context = maskCanvas.getContext("2d");
            const colorContext = colorCanvas.getContext("2d");
            if (start && last && context && colorContext) {
                configureDrawContext(context, brushSize, "paint", "#000");
                configureDrawContext(colorContext, brushSize, "paint", withMaskAlpha(brushColor));
                drawMaskFrame(context, start, last);
                drawMaskFrame(colorContext, start, last);
            }
        }
        drawingRef.current = { active: false, start: null, last: null };
        if (maskCanvas && colorCanvas) renderMaskPreview(maskCanvas, colorCanvas, previewCanvasRef.current, canvasHasPaint(maskCanvas));
    };

    const resetMask = () => {
        clearCanvas(maskCanvasRef.current);
        clearCanvas(colorCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
        setError("");
    };

    const submit = async () => {
        const nextPrompt = prompt.trim();
        const canvas = maskCanvasRef.current;
        const colorCanvas = colorCanvasRef.current;
        if (!nextPrompt) return setError("请输入修改要求");
        if (!canvas || !colorCanvas) return;
        if (!canvasHasPaint(canvas)) return setError("请先标记局部区域");
        setSubmitting(true);
        try {
            onConfirm({ prompt: nextPrompt, markedDataUrl: await buildMarkedReference(dataUrl, colorCanvas), model, channelId });
        } catch {
            setSubmitting(false);
            setError("生成标记参考图失败");
        }
    };

    const save = async () => {
        const canvas = maskCanvasRef.current;
        const colorCanvas = colorCanvasRef.current;
        if (!canvas || !colorCanvas) return;
        if (!canvasHasPaint(canvas)) return setError("请先标记局部区域");
        setSaving(true);
        try {
            await onSave(await buildMarkedReference(dataUrl, colorCanvas));
        } catch {
            setSaving(false);
            setError("保存标记图片失败");
        }
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={980} centered destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(360px,1fr)_320px]">
                <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-black/10 bg-transparent p-0 dark:border-white/10">
                    <div className="relative inline-block max-w-full overflow-hidden rounded-lg bg-transparent select-none">
                        <img src={dataUrl} alt="" className="block max-h-[68vh] max-w-full bg-transparent" draggable={false} />
                        {image ? (
                            <>
                                <canvas ref={maskCanvasRef} width={image.width} height={image.height} className="hidden" />
                                <canvas ref={colorCanvasRef} width={image.width} height={image.height} className="hidden" />
                                <canvas
                                    ref={previewCanvasRef}
                                    width={image.width}
                                    height={image.height}
                                    className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                                    onPointerDown={startDraw}
                                    onPointerMove={moveDraw}
                                    onPointerUp={stopDraw}
                                    onPointerCancel={stopDraw}
                                />
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="flex min-h-[360px] flex-col gap-5">
                    <div>
                        <h2 className="text-xl font-semibold">局部遮罩编辑</h2>
                        <div className="mt-2 text-sm opacity-60">{image ? `${image.width} x ${image.height}px` : "读取中"}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <Button type={mode === "paint" ? "primary" : "default"} icon={<Brush className="size-4" />} onClick={() => setMode("paint")}>
                            画笔
                        </Button>
                        <Button type={mode === "frame" ? "primary" : "default"} icon={<Square className="size-4" />} onClick={() => setMode("frame")}>
                            画框
                        </Button>
                        <Button type={mode === "erase" ? "primary" : "default"} icon={<Eraser className="size-4" />} onClick={() => setMode("erase")}>
                            擦除
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium opacity-75">笔刷大小</span>
                            <span className="font-semibold">{brushSize}px</span>
                        </div>
                        <Slider min={2} max={160} step={1} value={brushSize} onChange={setBrushSize} />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium opacity-75">笔刷颜色</span>
                        <ColorPicker value={brushColor} onChange={(_, hex) => setBrushColor(hex)} />
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">修改要求</div>
                        <Input.TextArea
                            rows={6}
                            value={prompt}
                            status={error && !prompt.trim() ? "error" : undefined}
                            placeholder="例如：把选中区域改成金属材质，保持原图光影"
                            onChange={(event) => {
                                setPrompt(event.target.value);
                                setError("");
                            }}
                        />
                        {error ? <div className="text-xs font-medium text-[#ef4444]">{error}</div> : null}
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">模型</div>
                        <ModelPicker className="canvas-compact-control h-10" config={{ ...config, model, imageChannelId: channelId || config.imageChannelId }} value={model} channelId={channelId || config.imageChannelId} onChange={onModelChange} capability="image" onMissingConfig={onMissingConfig} fullWidth />
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2">
                        <Button icon={<RotateCcw className="size-4" />} onClick={resetMask} disabled={submitting || saving}>
                            重置
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button icon={<X className="size-4" />} onClick={onClose} disabled={submitting || saving}>
                                取消
                            </Button>
                            <Button icon={<Save className="size-4" />} onClick={save} loading={saving} disabled={submitting || saving}>
                                保存图片
                            </Button>
                            <Button type="primary" icon={<WandSparkles className="size-4" />} onClick={submit} loading={submitting} disabled={submitting || saving}>
                                AI 修改
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function readCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawMaskStroke(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number) {
    if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
}

function configureDrawContext(context: CanvasRenderingContext2D, size: number, mode: Exclude<DrawMode, "frame">, color: string) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = size;
    context.globalCompositeOperation = mode === "paint" ? "source-over" : "destination-out";
    context.strokeStyle = color;
    context.fillStyle = color;
}

function drawMaskFrame(context: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }) {
    context.beginPath();
    context.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    context.stroke();
}

function drawFramePreview(canvas: HTMLCanvasElement | null, start: { x: number; y: number }, end: { x: number; y: number }, brushColor: string, brushSize: number) {
    const context = canvas?.getContext("2d");
    if (!context) return;
    context.save();
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.strokeStyle = withMaskAlpha(brushColor);
    drawMaskFrame(context, start, end);
    context.restore();
}

function canvasHasPaint(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) return false;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) return true;
    }
    return false;
}

function renderMaskPreview(maskCanvas: HTMLCanvasElement, colorCanvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement | null, withBorder = false) {
    const context = previewCanvas?.getContext("2d");
    if (!previewCanvas || !context) return;
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.drawImage(colorCanvas, 0, 0);
    if (withBorder) drawDashedMaskBorder(context, maskCanvas);
}

function drawDashedMaskBorder(context: CanvasRenderingContext2D, maskCanvas: HTMLCanvasElement) {
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return;
    const { width, height } = maskCanvas;
    const data = maskContext.getImageData(0, 0, width, height).data;
    const step = Math.max(1, Math.round(Math.max(width, height) / 1200));
    const dash = step * 8;
    const gap = step * 5;
    const period = dash + gap;

    context.save();
    context.fillStyle = maskBorderColor;
    context.shadowColor = "rgba(0, 0, 0, .24)";
    context.shadowBlur = step * 1.5;
    for (let y = step; y < height - step; y += step) {
        for (let x = step; x < width - step; x += step) {
            const offset = (y * width + x) * 4 + 3;
            if (data[offset] === 0 || !isMaskEdge(data, width, x, y, step)) continue;
            if ((x + y) % period > dash) continue;
            context.fillRect(x - step / 2, y - step / 2, Math.max(1.5, step), Math.max(1.5, step));
        }
    }
    context.restore();
}

function isMaskEdge(data: Uint8ClampedArray, width: number, x: number, y: number, step: number) {
    return data[((y - step) * width + x) * 4 + 3] === 0 || data[((y + step) * width + x) * 4 + 3] === 0 || data[(y * width + x - step) * 4 + 3] === 0 || data[(y * width + x + step) * 4 + 3] === 0;
}

async function buildMarkedReference(sourceDataUrl: string, colorCanvas: HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = colorCanvas.width;
    canvas.height = colorCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) return colorCanvas.toDataURL("image/png");
    const image = await loadCanvasImage(await toDrawableDataUrl(sourceDataUrl));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.drawImage(colorCanvas, 0, 0);
    return canvas.toDataURL("image/png");
}

function withMaskAlpha(color: string) {
    const hex = color.replace("#", "");
    if (!/^[\da-f]{6}$/i.test(hex)) return color;
    const value = Number.parseInt(hex, 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, .38)`;
}

async function toDrawableDataUrl(src: string) {
    if (/^(data|blob):/i.test(src)) return src;
    const blob = await downloadRemoteMedia(src);
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

function loadCanvasImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("读取图片失败"));
        image.src = src;
    });
}
