"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Image as ImageIcon, LoaderCircle, Music2, Plus, Video, X } from "lucide-react";
import { Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { channelIdForActiveModel, defaultConfig, normalizeLocalChannels, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { firstAllowed, imageSizeForCapability, maxAllowedCount, modelCapabilityFor, videoSizeForCapability } from "@/lib/model-capabilities";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasCameraControl } from "./canvas-camera-control";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover, type CanvasVideoFrameOption, type CanvasVideoResourceOption } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata, type CanvasVideoInputMode } from "../types";
import { PANORAMA_IMAGE_SIZE, isCanvasImageNodeType, isPanoramaNodeType } from "../utils/canvas-panorama";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

export type { CanvasVideoFrameOption };

export type CanvasNodeGenerationMode = CanvasGenerationMode;
export type CanvasVideoReferenceKind = "image" | "video" | "audio";
export type CanvasVideoReferenceSlot = "reference" | "firstFrame" | "lastFrame";

function videoReferenceAccept(kind: CanvasVideoReferenceKind) {
    return kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav";
}

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<boolean | void>;
    mentionReferences?: CanvasResourceReference[];
    videoFrameOptions?: CanvasVideoFrameOption[];
    videoResourceOptions?: CanvasVideoResourceOption[];
    onVideoReferenceUpload?: (nodeId: string, mode: CanvasVideoInputMode, kind: CanvasVideoReferenceKind, slot: CanvasVideoReferenceSlot, file: File) => Promise<void>;
    onVideoReferenceRemove?: (nodeId: string, slot: CanvasVideoReferenceSlot, resourceNodeId: string) => void;
    canvasScale?: number;
    positionVersion?: string;
    onImageSettingsOpenChange?: (open: boolean) => void;
    onPromptFocus?: () => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, mentionReferences = [], videoFrameOptions = [], videoResourceOptions = [], onVideoReferenceUpload, onVideoReferenceRemove, canvasScale = 1, positionVersion, onImageSettingsOpenChange, onPromptFocus }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode, modelCosts);
    const isPanorama = isPanoramaNodeType(node.type);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content);
    const sourcePrompt = isPanorama ? node.metadata?.panoramaSourcePrompt || "" : node.metadata?.prompt || "";
    const [prompt, setPrompt] = useState(sourcePrompt);
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, count: mode === "image" ? config.count : 1, seconds: mode === "video" ? config.videoSeconds : 1 });
    const isImageGenerating =
        mode === "image" &&
        (isRunning ||
            node.metadata?.status === "loading" ||
            Boolean(node.metadata?.imageCandidateBatches?.some((batch) => batch.items.some((candidate) => candidate.status === "loading"))));

    useEffect(() => {
        setPrompt(sourcePrompt);
    }, [node.id, sourcePrompt]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        onPromptChange(node.id, value);
    };

    const canSubmit = Boolean(prompt.trim()) || (isPanorama && (hasImageContent || mentionReferences.length > 0));

    const submit = async () => {
        const text = prompt.trim();
        if (!canSubmit || isRunning || isImageGenerating) return;
        if ((await onGenerate(node.id, mode, text)) !== false) {
            if (!isPanorama) setPrompt((current) => (current === text ? "" : current));
        }
    };

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {mode === "video" ? (
                <CanvasVideoInputModes
                    node={node}
                    options={videoResourceOptions}
                    theme={theme}
                    onModeChange={(videoInputMode) => onConfigChange(node.id, { videoInputMode })}
                    onUpload={onVideoReferenceUpload}
                    onRemove={onVideoReferenceRemove}
                />
            ) : null}
            <CanvasPromptChipInput
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                onFocus={onPromptFocus}
                className="thin-scrollbar h-40 w-full resize-none rounded-xl px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: "transparent", color: theme.node.text }}
                placeholder={isPanorama ? "描述想生成的全景，或上传/连接图片作为参考" : promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className={`mt-2 flex min-w-0 items-center justify-between gap-2 ${isImageGenerating ? "pointer-events-none cursor-not-allowed opacity-45" : ""}`} aria-disabled={isImageGenerating} inert={isImageGenerating}>
                <div className="flex min-w-0 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker className="!w-[180px] !min-w-0 !shrink-0" config={config} value={config.model} channelId={config.imageChannelId} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="image" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !w-[148px] !shrink-0 !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                                showSize={!isPanorama}
                                variant="node"
                                canvasScale={canvasScale}
                                positionVersion={positionVersion}
                                reuseImageAsReference={node.type === CanvasNodeType.Image && hasImageContent ? Boolean(node.metadata?.reuseImageAsReference) : undefined}
                                onReuseImageAsReferenceChange={node.type === CanvasNodeType.Image && hasImageContent ? (reuseImageAsReference) => onConfigChange(node.id, { reuseImageAsReference }) : undefined}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker className="!w-[180px] !min-w-0 !shrink-0" config={config} value={config.model} channelId={config.videoChannelId} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !w-[148px] !shrink-0 !justify-start !rounded-full !px-3" frameOptions={videoFrameOptions} resourceOptions={videoResourceOptions} metadata={node.metadata} firstFrameNodeId={node.metadata?.firstFrameNodeId} lastFrameNodeId={node.metadata?.lastFrameNodeId} onFrameChange={(patch) => onConfigChange(node.id, patch)} onMetadataChange={(patch) => onConfigChange(node.id, patch)} onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} variant="node" canvasScale={canvasScale} positionVersion={positionVersion} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker className="!w-[180px] !min-w-0 !shrink-0" config={config} value={config.model} channelId={config.audioChannelId || config.activeChannelId} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} resourceOptions={videoResourceOptions} metadata={node.metadata} onMetadataChange={(patch) => onConfigChange(node.id, patch)} buttonClassName="!h-10 !w-[148px] !shrink-0 !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <ModelPicker config={config} value={config.model} channelId={config.textChannelId} onChange={(model, channelId) => onConfigChange(node.id, { model, channelId })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                    )}
                    {mode === "video" || (mode === "image" && !isPanorama) ? (
                        <CanvasCameraControl value={node.metadata?.cameraControl} onChange={(cameraControl) => onConfigChange(node.id, { cameraControl })} buttonClassName="!h-10 !min-w-[92px] !justify-start !rounded-full !px-3" />
                    ) : null}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    disabled={isRunning || isImageGenerating || !canSubmit}
                    onClick={submit}
                    aria-label="生成"
                >
                    <span className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                            <CreditSymbol />
                            {credits.toLocaleString()}
                        </span>
                        {isImageGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </span>
                </Button>
            </div>
        </div>
    );
}

const VIDEO_INPUT_MODE_OPTIONS: Array<{ value: CanvasVideoInputMode; label: string }> = [
    { value: "text-to-video", label: "文生视频" },
    { value: "image-to-video", label: "图生视频" },
    { value: "first-last-frame", label: "首尾帧" },
    { value: "all-reference", label: "全能参考" },
    { value: "video-continuation", label: "视频续写" },
];

function CanvasVideoInputModes({ node, options, theme, onModeChange, onUpload, onRemove }: { node: CanvasNodeData; options: CanvasVideoResourceOption[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onModeChange: (mode: CanvasVideoInputMode) => void; onUpload?: CanvasNodePromptPanelProps["onVideoReferenceUpload"]; onRemove?: CanvasNodePromptPanelProps["onVideoReferenceRemove"] }) {
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<{ kind: CanvasVideoReferenceKind; slot: CanvasVideoReferenceSlot } | null>(null);
    const mode = node.metadata?.videoInputMode || "text-to-video";
    const optionByNodeId = new Map(options.map((option) => [option.nodeId, option]));
    const preferredIds = [...(node.metadata?.videoReferenceNodeIds || []), node.metadata?.firstFrameNodeId || "", node.metadata?.lastFrameNodeId || ""];
    const resources = orderVideoResources(options.filter((option) => option.kind !== "text"), preferredIds);
    const images = resources.filter((option) => option.kind === "image");
    const videos = resources.filter((option) => option.kind === "video");
    const audios = resources.filter((option) => option.kind === "audio");
    const selectUpload = (kind: CanvasVideoReferenceKind, slot: CanvasVideoReferenceSlot = "reference") => {
        if (!onUpload) return;
        const input = uploadInputRef.current;
        if (!input) return;
        setUploadTarget({ kind, slot });
        input.accept = videoReferenceAccept(kind);
        input.click();
    };
    const uploadFile = async (file?: File) => {
        if (!file || !uploadTarget || !onUpload) return;
        await onUpload(node.id, mode, uploadTarget.kind, uploadTarget.slot, file);
        setUploadTarget(null);
    };

    const imageReference = images[0];
    const continuationReference = videos[0];
    const firstFrame = node.metadata?.firstFrameNodeId ? optionByNodeId.get(node.metadata.firstFrameNodeId) : undefined;
    const selectedFirstFrame = firstFrame?.kind === "image" ? firstFrame : images[0];
    const lastFrame = node.metadata?.lastFrameNodeId ? optionByNodeId.get(node.metadata.lastFrameNodeId) : undefined;
    const selectedLastFrame = lastFrame?.kind === "image" && lastFrame.nodeId !== selectedFirstFrame?.nodeId ? lastFrame : images.find((option) => option.nodeId !== selectedFirstFrame?.nodeId);

    return (
        <div className="mb-2 border-b pb-2" style={{ borderColor: theme.toolbar.border }}>
            <div className="flex flex-wrap gap-1.5">
                {VIDEO_INPUT_MODE_OPTIONS.map((option) => {
                    const selected = mode === option.value;
                    return <button key={option.value} type="button" className="h-7 rounded-md border px-2 text-xs transition-colors" style={{ borderColor: selected ? theme.node.stroke : theme.toolbar.border, background: selected ? theme.node.fill : "transparent", color: selected ? theme.node.text : theme.node.muted }} onClick={() => onModeChange(option.value)}>{option.label}</button>;
                })}
            </div>
            {mode === "text-to-video" ? <DisabledVideoResources options={resources} theme={theme} onRemove={(resourceNodeId) => onRemove?.(node.id, "reference", resourceNodeId)} /> : null}
            {mode === "image-to-video" ? <>
                <VideoReferenceSection label="参考图片" theme={theme}><VideoReferenceTile option={imageReference} kind="image" theme={theme} onAdd={() => selectUpload("image")} onRemove={() => imageReference && onRemove?.(node.id, "reference", imageReference.nodeId)} /></VideoReferenceSection>
                <DisabledVideoResources options={[...images.slice(1), ...videos, ...audios]} theme={theme} onRemove={(resourceNodeId) => onRemove?.(node.id, "reference", resourceNodeId)} />
            </> : null}
            {mode === "first-last-frame" ? <>
                <VideoReferenceSection label="首帧" theme={theme}><VideoReferenceTile option={selectedFirstFrame} kind="image" theme={theme} onAdd={() => selectUpload("image", "firstFrame")} onRemove={() => selectedFirstFrame && onRemove?.(node.id, "firstFrame", selectedFirstFrame.nodeId)} /></VideoReferenceSection>
                <VideoReferenceSection label="尾帧" theme={theme}><VideoReferenceTile option={selectedLastFrame} kind="image" theme={theme} onAdd={() => selectUpload("image", "lastFrame")} onRemove={() => selectedLastFrame && onRemove?.(node.id, "lastFrame", selectedLastFrame.nodeId)} /></VideoReferenceSection>
                <DisabledVideoResources options={[...images.filter((option) => option.nodeId !== selectedFirstFrame?.nodeId && option.nodeId !== selectedLastFrame?.nodeId), ...videos, ...audios]} theme={theme} onRemove={(resourceNodeId) => onRemove?.(node.id, "reference", resourceNodeId)} />
            </> : null}
            {mode === "all-reference" ? <>
                <VideoReferenceSection label="图片 · 最多 9 张" theme={theme}><VideoReferenceTiles options={images.slice(0, 9)} kind="image" limit={9} theme={theme} onAdd={() => selectUpload("image")} onRemove={(id) => onRemove?.(node.id, "reference", id)} /></VideoReferenceSection>
                <VideoReferenceSection label="视频 · 最多 3 个" theme={theme}><VideoReferenceTiles options={videos.slice(0, 3)} kind="video" limit={3} theme={theme} onAdd={() => selectUpload("video")} onRemove={(id) => onRemove?.(node.id, "reference", id)} /></VideoReferenceSection>
                <VideoReferenceSection label="音频 · 最多 3 个" theme={theme}><VideoReferenceTiles options={audios.slice(0, 3)} kind="audio" limit={3} theme={theme} onAdd={() => selectUpload("audio")} onRemove={(id) => onRemove?.(node.id, "reference", id)} /></VideoReferenceSection>
                <DisabledVideoResources options={[...images.slice(9), ...videos.slice(3), ...audios.slice(3)]} theme={theme} onRemove={(resourceNodeId) => onRemove?.(node.id, "reference", resourceNodeId)} />
            </> : null}
            {mode === "video-continuation" ? <>
                <VideoReferenceSection label="续写视频" theme={theme}><VideoReferenceTile option={continuationReference} kind="video" theme={theme} onAdd={() => selectUpload("video")} onRemove={() => continuationReference && onRemove?.(node.id, "reference", continuationReference.nodeId)} /></VideoReferenceSection>
                <DisabledVideoResources options={[...images, ...videos.slice(1), ...audios]} theme={theme} onRemove={(resourceNodeId) => onRemove?.(node.id, "reference", resourceNodeId)} />
            </> : null}
            <input ref={uploadInputRef} className="hidden" type="file" accept={uploadTarget ? videoReferenceAccept(uploadTarget.kind) : undefined} onChange={(event) => { void uploadFile(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
    );
}

function orderVideoResources(options: CanvasVideoResourceOption[], preferredIds: string[]) {
    const byId = new Map(options.map((option) => [option.nodeId, option]));
    const ordered = preferredIds.map((id) => byId.get(id)).filter((option): option is CanvasVideoResourceOption => Boolean(option));
    const included = new Set(ordered.map((option) => option.nodeId));
    return [...ordered, ...options.filter((option) => !included.has(option.nodeId))];
}

function VideoReferenceSection({ label, theme, children }: { label: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; children: ReactNode }) {
    return <div className="mt-2 flex min-w-0 items-center gap-2"><span className="w-[88px] shrink-0 text-xs" style={{ color: theme.node.muted }}>{label}</span><div className="flex min-w-0 flex-wrap gap-1.5">{children}</div></div>;
}

function VideoReferenceTiles({ options, kind, limit, theme, onAdd, onRemove }: { options: CanvasVideoResourceOption[]; kind: CanvasVideoReferenceKind; limit: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onAdd: () => void; onRemove: (id: string) => void }) {
    return <>{options.map((option) => <VideoReferenceTile key={option.nodeId} option={option} kind={kind} theme={theme} onRemove={() => onRemove(option.nodeId)} />)}{options.length < limit ? <VideoReferenceTile kind={kind} theme={theme} onAdd={onAdd} /> : null}</>;
}

function DisabledVideoResources({ options, theme, onRemove }: { options: CanvasVideoResourceOption[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onRemove?: (resourceNodeId: string) => void }) {
    return options.length ? <VideoReferenceSection label="已连接素材" theme={theme}>{options.map((option) => <VideoReferenceTile key={option.nodeId} option={option} kind={option.kind as CanvasVideoReferenceKind} theme={theme} disabled onRemove={() => onRemove?.(option.nodeId)} />)}</VideoReferenceSection> : null;
}

function VideoReferenceTile({ option, kind, label, theme, onAdd, onRemove, disabled = false }: { option?: CanvasVideoResourceOption; kind: CanvasVideoReferenceKind; label?: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onAdd?: () => void; onRemove?: () => void; disabled?: boolean }) {
    const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : Music2;
    if (!option) return <button type="button" title={label ? `上传${label}` : `上传${kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}`} aria-label={label ? `上传${label}` : "上传参考素材"} className="flex size-12 shrink-0 flex-col items-center justify-center rounded-md border border-dashed transition-colors" style={{ borderColor: theme.node.stroke, color: theme.node.muted }} onClick={onAdd}><Plus className="size-4" /><Icon className="mt-0.5 size-3" /></button>;
    return <div className={`group relative size-12 shrink-0 overflow-visible rounded-md border ${disabled ? "cursor-not-allowed" : ""}`} style={{ borderColor: theme.node.stroke, background: theme.node.fill }} title={disabled ? `${option.label} 不适用于当前模式` : option.label} aria-disabled={disabled}>
        <div className={`size-full overflow-hidden rounded-[5px] ${disabled ? "opacity-35 grayscale" : ""}`}>{kind === "image" && option.previewUrl ? <img src={option.previewUrl} alt={option.label} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-0.5" style={{ color: theme.node.muted }}><Icon className="size-4" /><span className="max-w-full truncate px-1 text-[10px]">{label || option.label}</span></div>}</div>
        {onRemove ? <button type="button" title="移除参考素材" aria-label="移除参考素材" className="absolute -right-2 -top-2 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border-2 border-white text-white shadow-sm transition-transform hover:scale-110" style={{ background: "#ef5350" }} onClick={onRemove}><X className="size-3.5 stroke-[3]" /></button> : null}
    </div>;
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode, modelCosts?: Parameters<typeof modelCapabilityFor>[0]): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    const model = node.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model);
    const channels = globalConfig.channelMode === "remote" ? globalConfig.publicChannels : normalizeLocalChannels(globalConfig);
    const nodeChannelId = node.metadata?.channelId?.trim() || "";
    const nodeChannel = channels.find((channel) => channel.id === nodeChannelId && (channel.models?.length ? channel.models.includes(model) : globalConfig.channelMode === "local"));
    const channelId = nodeChannel ? nodeChannelId : channelIdForActiveModel({ ...globalConfig, model });
    const imageChannelId = mode === "image" ? channelId || globalConfig.imageChannelId : globalConfig.imageChannelId;
    const videoChannelId = mode === "video" ? channelId || globalConfig.videoChannelId : globalConfig.videoChannelId;
    const textChannelId = mode === "text" ? channelId || globalConfig.textChannelId : globalConfig.textChannelId;
    const audioChannelId = mode === "audio" ? channelId || globalConfig.audioChannelId : globalConfig.audioChannelId;
    const activeChannelId = mode === "image" ? imageChannelId : mode === "video" ? videoChannelId : mode === "text" ? textChannelId : mode === "audio" ? audioChannelId || globalConfig.activeChannelId : globalConfig.activeChannelId;
    const capability = modelCapabilityFor(modelCosts, model);
    const preferredRatio = firstAllowed("21:9", capability.ratios, capability.ratios[0] || "21:9");
    const preferredResolution = firstAllowed("2k", capability.resolutions, capability.resolutions[0] || "1k");
    const preferredVideoRatio = firstAllowed("21:9", capability.ratios, capability.ratios[0] || "16:9");
    const preferredVideoQuality = firstAllowed("720p", capability.videoQualities, capability.videoQualities[0] || "720p");
    const rawSize = node.metadata?.size || (mode === "video" ? videoSizeForCapability(preferredVideoRatio, { ...capability, videoQualities: [preferredVideoQuality] }) : mode === "image" ? imageSizeForCapability(`${preferredRatio}-${preferredResolution}`, capability) : globalConfig.size || defaultConfig.size);
    return {
        ...globalConfig,
        model,
        activeChannelId,
        imageChannelId,
        videoChannelId,
        textChannelId,
        audioChannelId,
        quality: firstAllowed(node.metadata?.quality || "medium", capability.qualities, capability.qualities[0] || "medium"),
        size: isPanoramaNodeType(node.type) ? PANORAMA_IMAGE_SIZE : mode === "video" ? videoSizeForCapability(rawSize, capability) : mode === "image" ? imageSizeForCapability(rawSize, capability) : rawSize,
        videoSeconds: capability.fixedDuration ? firstAllowed(node.metadata?.seconds || "5", capability.durationOptions, capability.durationOptions[0] || "5") : String(Math.max(1, Math.min(capability.maxSeconds || 15, Number(node.metadata?.seconds || "5") || 1))),
        vquality: firstAllowed(node.metadata?.vquality || "720p", capability.videoQualities, capability.videoQualities[0] || "720p"),
        videoMode: node.metadata?.mode || globalConfig.videoMode || defaultConfig.videoMode,
        videoNegativePrompt: node.metadata?.negativePrompt || globalConfig.videoNegativePrompt || defaultConfig.videoNegativePrompt,
        videoMultiShot: node.metadata?.multiShot || globalConfig.videoMultiShot || defaultConfig.videoMultiShot,
        videoShotType: node.metadata?.shotType || globalConfig.videoShotType || defaultConfig.videoShotType,
        videoGenerateAudio: capability.videoGenerateAudio ? node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio : "false",
        videoCharacterOrientation: node.metadata?.characterOrientation || globalConfig.videoCharacterOrientation || defaultConfig.videoCharacterOrientation,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: firstAllowed(node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice, capability.audioVoices, capability.audioVoices[0] || defaultConfig.audioVoice),
        audioFormat: firstAllowed(node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat, capability.audioFormats, capability.audioFormats[0] || defaultConfig.audioFormat),
        audioSpeed: firstAllowed(node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed, capability.audioSpeeds, capability.audioSpeeds[0] || defaultConfig.audioSpeed),
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        mimoTtsVoice: node.metadata?.mimoTtsVoice || globalConfig.mimoTtsVoice || defaultConfig.mimoTtsVoice,
        mimoTtsFormat: node.metadata?.mimoTtsFormat || globalConfig.mimoTtsFormat || defaultConfig.mimoTtsFormat,
        mimoVoiceDesignPrompt: node.metadata?.mimoVoiceDesignPrompt || globalConfig.mimoVoiceDesignPrompt || defaultConfig.mimoVoiceDesignPrompt,
        count: String(maxAllowedCount(node.metadata?.count || (mode === "image" ? "1" : globalConfig.count) || defaultConfig.count, capability)),
    };
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoMode") return { mode: value };
    if (key === "videoNegativePrompt") return { negativePrompt: value };
    if (key === "videoMultiShot") return { multiShot: value };
    if (key === "videoShotType") return { shotType: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoCharacterOrientation") return { characterOrientation: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string): Partial<CanvasNodeMetadata> {
    return { [key]: value } as Partial<CanvasNodeMetadata>;
}
