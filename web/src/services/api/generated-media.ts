export type PersistedGeneratedMedia = {
    url: string;
    mimeType?: string;
    bytes?: number;
};

function isPersistedGeneratedURL(value: string) {
    return value.startsWith("/api/media/generated/") || value.startsWith("/api/files/");
}

export async function persistGeneratedMedia(url: string, contentType = "") {
    const value = url.trim();
    if (!value || isPersistedGeneratedURL(value)) return { url: value, mimeType: contentType };

    let response: Response;
    if (value.startsWith("data:") || value.startsWith("blob:")) {
        const blob = await fetch(value).then(async (result) => {
            if (!result.ok) throw new Error(`生成结果读取失败：${result.status}`);
            return result.blob();
        });
        const form = new FormData();
        form.append("file", blob, `generated-${Date.now()}`);
        response = await fetch("/api/media/generated", { method: "POST", body: form });
    } else {
        response = await fetch("/api/media/generated", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: value, contentType }),
        });
    }
    const payload = (await response.json().catch(() => null)) as { code?: number; msg?: string; data?: PersistedGeneratedMedia } | null;
    if (!response.ok || payload?.code !== 0 || !payload.data?.url) throw new Error(payload?.msg || "生成结果保存失败");
    return payload.data;
}

export async function persistGeneratedMediaResults<T extends { dataUrl: string }>(images: T[]) {
    return Promise.all(images.map(async (image) => {
        try {
            const saved = await persistGeneratedMedia(image.dataUrl, "image/png");
            return { ...image, dataUrl: saved.url };
        } catch {
            return image;
        }
    }));
}
