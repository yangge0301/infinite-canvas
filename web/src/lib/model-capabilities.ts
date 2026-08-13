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

export const imageRatioOptions = ["1:1", "2:1", "3:2", "4:3", "3:4", "16:9", "9:16", "21:9", "2:3", "9:21"];
export const imageResolutionOptions = ["1k", "2k", "4k"];
export const imageQualityOptions = ["low", "medium", "high"];
export const videoRatioOptions = ["21:9", "16:9", "9:16", "4:3", "3:4", "1:1"];
export const videoQualityOptions = ["480p", "720p", "768p", "1080p", "2k", "4k"];
export const videoDurationOptions = ["5", "10", "15", "20", "25", "30"];
export const audioVoiceOptions = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"];
export const audioFormatOptions = ["mp3", "wav", "opus"];
export const audioSpeedOptions = ["0.75", "1", "1.25", "1.5", "1.75", "2"];

export function inferModelType(model: string): ModelType {
    const value = model.toLowerCase();
    if (value.includes("video") || value.includes("seedance") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("hailuo") || value.includes("minimax") || value.includes("skyreels") || value.includes("happyhorse") || value.includes("runway") || value.includes("aleph") || value.includes("vidu") || value.includes("pixverse") || value.includes("omni-flash") || value.includes("infinitalk") || value.includes("wan2-5") || value.includes("wan2.5") || value.includes("wan2-6") || value.includes("wan2.6") || value.includes("wan2-7") || value.includes("wan2.7")) return "video";
    if (value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound") || value.includes("elevenlabs") || value.includes("suno") || value.includes("lyrics") || value.includes("vocal") || value.includes("midi") || value.includes("wav")) return "audio";
    if (value.includes("image") || value.includes("nano-banana") || value.includes("seedream") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("gemini-2.5-flash") || value.includes("gemini-3-pro") || value.includes("gemini-3.1-flash") || value.includes("flux") || value.includes("kontext") || value.includes("qwen/image") || value.includes("ideogram") || value.includes("recraft") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney") || value.includes("topaz/image") || value.includes("grok-imagine")) return "image";
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
        videoQualities: type === "video" ? [...videoQualityOptions] : [],
        videoGenerateAudio: false,
        audioVoices: type === "audio" ? [...audioVoiceOptions] : [],
        audioFormats: type === "audio" ? [...audioFormatOptions] : [],
        audioSpeeds: type === "audio" ? [...audioSpeedOptions] : [],
        creditType: "request",
    };
}

export function modelCapabilityFor(configs: ModelCapabilityConfig[] | undefined, model: string) {
    return configs?.find((item) => item.model === model) || defaultModelCapability(model);
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
