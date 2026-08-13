import type { ComponentProps } from "react";
import { Zap } from "lucide-react";
import type { ModelCapabilityConfig } from "@/lib/model-capabilities";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            <Zap className="size-[1em] fill-current" strokeWidth={2.4} />
        </span>
    );
}

export type ModelCreditCost = Pick<ModelCapabilityConfig, "model" | "credits" | "type" | "creditType">;

export function modelCreditCost(modelCosts: ModelCreditCost[] | undefined, model: string) {
    return modelCosts?.find((item) => item.model === model)?.credits || 0;
}

export function requestCreditCost(options: { channelMode: string; modelCosts?: ModelCreditCost[]; model: string; count?: string | number; seconds?: string | number }) {
    if (options.channelMode !== "remote") return 0;
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    const config = options.modelCosts?.find((item) => item.model === options.model);
    const multiplier = config?.type === "video" && config.creditType === "second" ? Math.max(1, Math.floor(Number(options.seconds) || 1)) : count;
    return (config?.credits || 0) * multiplier;
}
