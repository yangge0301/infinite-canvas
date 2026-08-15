"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Cpu } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { filterModelsByCapability, normalizeLocalChannels, useConfigStore, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    channelId?: string;
    capability?: ModelCapability;
    onChange: (model: string, channelId?: string) => void;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    popupScale?: number;
};

export function ModelPicker({ config, value, channelId, capability, onChange, className, fullWidth = false, placeholder = "选择模型", onMissingConfig, popupScale = 1 }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const autoCorrectedChannelRef = useRef("");
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const channelOptions = useMemo(() => {
        const channels =
            config.channelMode === "remote"
                ? config.publicChannels.map((channel) => ({ id: channel.id, name: channel.name || "云端渠道", baseUrl: channel.baseUrl, models: channel.models }))
                : normalizeLocalChannels(config).map((channel) => ({ id: channel.id, name: channel.name || "本地渠道", baseUrl: channel.baseUrl, models: channel.models }));
        const models = channels.flatMap((channel) => (channel.models ?? []).map((model) => ({ key: `${channel.id}::${model}`, channelId: channel.id, channelName: channel.name, model, displayName: config.channelMode === "remote" ? modelCosts?.find((item) => item.model === model)?.displayName || model : model })));
        if (!capability) return models;
        return models.filter((item) => filterModelsByCapability([item.model], capability, config.channelMode === "remote" ? modelCosts : undefined).length > 0);
    }, [capability, config, modelCosts]);
    const currentOption = useMemo(() => {
        if (!value) return undefined;
        return channelOptions.find((item) => item.model === value && item.channelId === channelId) || channelOptions.find((item) => item.model === value);
    }, [channelId, channelOptions, value]);
    const options = channelOptions;
    const current = value || "";
    const currentValue = current && currentOption ? currentOption.key : "";

    useEffect(() => {
        const targetChannelId = currentOption?.channelId;
        if (!value || !targetChannelId || channelId === targetChannelId) {
            autoCorrectedChannelRef.current = "";
            return;
        }
        const correctionKey = `${value}\u0000${channelId || ""}\u0000${targetChannelId}`;
        if (autoCorrectedChannelRef.current === correctionKey) return;
        autoCorrectedChannelRef.current = correctionKey;
        onChange(value, targetChannelId);
    }, [channelId, currentOption?.channelId, onChange, value]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current ? currentValue : ""}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") {
                    onMissingConfig?.();
                    return;
                }
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={(nextValue) => {
                const option = options.find((item) => item.key === nextValue);
                if (option) onChange(option.model, option.channelId);
            }}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current || placeholder}
            >
                <ModelIcon model={current} />
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{currentOption?.displayName || current || placeholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
                style={popupScale === 1 ? undefined : { zoom: popupScale }}
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    options.map((option) => (
                        <SelectItem key={option.key} value={option.key} textValue={`${option.displayName} ${option.model} ${option.channelName}`}>
                            <ModelLabel model={option.model} displayName={option.displayName} channelName={option.channelName} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {config.channelMode === "remote" ? "暂无可用模型" : "请先到配置里拉取模型列表"}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function ModelLabel({ model, displayName, channelName }: { model: string; displayName?: string; channelName?: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{displayName || model}</span>
            {displayName && displayName !== model ? <span className="max-w-24 shrink-0 truncate text-xs opacity-50">{model}</span> : null}
            {channelName ? <span className="ml-auto max-w-24 shrink-0 truncate text-xs opacity-50">{channelName}</span> : null}
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(model);
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
