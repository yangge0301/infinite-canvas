export type ModelType = "text" | "image" | "video" | "audio";

export type ModelCapabilityConfig = {
    model: string;
    displayName: string;
    type: ModelType;
    credits: number;
    ratios: string[];
    resolutions: string[];
    qualities: string[];
    maxCount: number;
    fixedDuration: boolean;
    durationOptions: string[];
    maxSeconds: number;
    videoQualities: string[];
    videoGenerateAudio: boolean;
    audioVoices: string[];
    audioFormats: string[];
    audioSpeeds: string[];
    creditType: "request" | "second";
};

export const imageRatioOptions = ["21:9", "16:9", "9:16", "1:1", "2:1", "3:2", "4:3", "3:4", "2:3", "9:21"];
export const imageResolutionOptions = ["1k", "2k", "4k"];
export const imageQualityOptions = ["high", "medium", "low"];
export const videoRatioOptions = ["21:9", "16:9", "9:16", "4:3", "3:4", "1:1"];
export const videoQualityOptions = ["480p", "720p", "768p", "1080p", "1440p", "2k", "4k"];
const defaultVideoQualityOptions = ["480p", "720p", "768p", "1080p", "2k", "4k"];
export const videoDurationOptions = ["5", "10", "15", "20", "25", "30"];
export const audioVoiceOptions = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"];
export const audioFormatOptions = ["mp3", "wav", "opus"];
export const audioSpeedOptions = ["0.75", "1", "1.25", "1.5", "1.75", "2"];

const videoQualityHeights: Record<string, number> = { "480p": 480, "720p": 720, "768p": 768, "1080p": 1080, "1440p": 1440, "2k": 2048, "4k": 4096 };
const video1440pSizes: Record<string, string> = { "21:9": "3360x1440", "16:9": "2560x1440", "4:3": "1920x1440", "1:1": "1440x1440", "3:4": "1440x1920", "9:16": "1440x2560" };

export function inferModelType(model: string): ModelType {
    const value = model.toLowerCase();
    const normalized = value.replace(/[\s_]+/g, "-");
    if (value.includes("video") || value.includes("seedance") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("hailuo") || value.includes("minimax") || value.includes("skyreels") || value.includes("happyhorse") || value.includes("runway") || value.includes("aleph") || value.includes("vidu") || value.includes("pixverse") || value.includes("omni-flash") || value.includes("infinitalk") || value.includes("wan2-5") || value.includes("wan2.5") || value.includes("wan2-6") || value.includes("wan2.6") || value.includes("wan2-7") || value.includes("wan2.7")) return "video";
    if (value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound") || value.includes("elevenlabs") || value.includes("suno") || value.includes("lyrics") || value.includes("vocal") || value.includes("midi") || value.includes("wav")) return "audio";
    if (value.includes("image") || value.includes("nano-banana") || value.includes("nano banana") || normalized.includes("nano-banana") || value.includes("seedream") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("gemini-2.5-flash") || value.includes("gemini-3-pro") || value.includes("gemini-3.1-flash") || value.includes("flux") || value.includes("kontext") || value.includes("qwen/image") || value.includes("ideogram") || value.includes("recraft") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney") || value.includes("topaz/image") || value.includes("grok-imagine")) return "image";
    return "text";
}

export function defaultModelCapability(model: string, type = inferModelType(model)): ModelCapabilityConfig {
    return {
        model,
        displayName: model,
        type,
        credits: 0,
        ratios: type === "image" ? [...imageRatioOptions] : type === "video" ? [...videoRatioOptions] : [],
        resolutions: type === "image" ? [...imageResolutionOptions] : [],
        qualities: type === "image" ? [...imageQualityOptions] : [],
        maxCount: type === "image" || type === "video" ? 4 : 0,
        fixedDuration: false,
        durationOptions: type === "video" ? ["5", "10", "15"] : [],
        maxSeconds: type === "video" ? 15 : 0,
        videoQualities: type === "video" ? [...defaultVideoQualityOptions] : [],
        videoGenerateAudio: false,
        audioVoices: type === "audio" ? [...audioVoiceOptions] : [],
        audioFormats: type === "audio" ? [...audioFormatOptions] : [],
        audioSpeeds: type === "audio" ? [...audioSpeedOptions] : [],
        creditType: "request",
    };
}

export function modelCapabilityFor(configs: ModelCapabilityConfig[] | undefined, model: string) {
    return configuredModelCapability(configs, model) || defaultModelCapability(model);
}

export function configuredModelCapability(configs: ModelCapabilityConfig[] | undefined, model: string) {
    const configured = configs?.find((item) => item.model === model);
    if (!configured) return undefined;
    const defaults = defaultModelCapability(configured.model, configured.type || inferModelType(configured.model));
    return {
        ...defaults,
        ...configured,
        ratios: capabilityList(configured.ratios, defaults.ratios),
        resolutions: capabilityList(configured.resolutions, defaults.resolutions),
        qualities: capabilityList(configured.qualities, defaults.qualities),
        durationOptions: capabilityList(configured.durationOptions, defaults.durationOptions),
        videoQualities: capabilityList(configured.videoQualities, configured.type === "video" ? videoQualityOptions : defaults.videoQualities),
        audioVoices: capabilityList(configured.audioVoices, defaults.audioVoices),
        audioFormats: capabilityList(configured.audioFormats, defaults.audioFormats),
        audioSpeeds: capabilityList(configured.audioSpeeds, defaults.audioSpeeds),
    };
}

function capabilityList(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) return [...fallback];
    const allowed = new Set(value.filter((item): item is string => typeof item === "string"));
    return fallback.filter((item) => allowed.has(item));
}

export function modelTypeFor(configs: ModelCapabilityConfig[] | undefined, model: string) {
    return configs?.find((item) => item.model === model)?.type || inferModelType(model);
}

export function firstAllowed(value: string, values: string[], fallback: string) {
    return values.includes(value) ? value : values[0] || fallback;
}

export function maxAllowedCount(value: string | number, capability: ModelCapabilityConfig) {
    const count = Math.max(1, Math.floor(Number(value) || 1));
    return capability.maxCount ? Math.min(count, capability.maxCount) : count;
}

export function imageSizeForCapability(value: string, capability: ModelCapabilityConfig) {
    const ratio = capabilityRatio(value, capability.ratios, "1:1");
    const resolution = nearestAllowedResolution(value, capability.resolutions, { "1k": 1024, "2k": 2048, "4k": 3840 }, "1k");
    return sizeForRatio(ratio, resolution);
}

export function videoSizeForCapability(value: string, capability: ModelCapabilityConfig, selectedQuality?: string) {
    const ratio = capabilityRatio(value, capability.ratios, "16:9");
    const quality = selectedQuality?.toLowerCase();
    const resolution = quality && capability.videoQualities.includes(quality) ? quality : nearestAllowedResolution(value, capability.videoQualities, videoQualityHeights, "720p");
    return videoSizeForRatio(ratio, resolution);
}

export function videoSizeForRatio(ratio: string, resolution: string | number) {
    if ((String(resolution).toLowerCase() === "1440p" || resolution === 1440) && video1440pSizes[ratio]) return video1440pSizes[ratio];
    const [width, height] = ratio.split(":").map(Number);
    const targetHeight = typeof resolution === "number" ? resolution : videoQualityHeights[resolution.toLowerCase()] || 720;
    if (!width || !height || !targetHeight) return "1280x720";
    return `${Math.round((targetHeight * width) / height)}x${targetHeight}`;
}

function capabilityRatio(value: string, ratios: string[], fallback: string) {
    const normalized = String(value || "").replace(/-\d+k$/i, "");
    if (ratios.includes(normalized)) return normalized;
    const match = normalized.match(/^(\d+)x(\d+)$/);
    if (!match) return ratios[0] || fallback;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height || !ratios.length) return ratios[0] || fallback;
    return ratios.reduce((closest, ratio) => {
        const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
        return Math.abs(width / height - ratioWidth / ratioHeight) < Math.abs(width / height - Number(closest.split(":")[0]) / Number(closest.split(":")[1])) ? ratio : closest;
    }, ratios[0]);
}

function nearestAllowedResolution(value: string, values: string[], dimensions: Record<string, number>, fallback: string) {
    const direct = String(value || "").match(/-(\d+k)$/i)?.[1]?.toLowerCase();
    if (direct && values.includes(direct)) return dimensions[direct];
    const size = String(value || "").match(/^(\d+)x(\d+)$/);
    if (!size || !values.length) return dimensions[values[0] || fallback];
    const edge = Math.max(Number(size[1]), Number(size[2]));
    const closest = values.reduce((current, option) => Math.abs(edge - dimensions[option]) < Math.abs(edge - dimensions[current]) ? option : current, values[0]);
    return dimensions[closest] || dimensions[fallback];
}

function sizeForRatio(ratio: string, longEdge: number) {
    const [width, height] = ratio.split(":").map(Number);
    if (!width || !height || !longEdge) return "1024x1024";
    if (width >= height) return `${longEdge}x${Math.max(16, Math.round((longEdge * height) / width / 16) * 16)}`;
    return `${Math.max(16, Math.round((longEdge * width) / height / 16) * 16)}x${longEdge}`;
}
