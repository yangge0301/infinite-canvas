const TEMP_REFERENCE_UPLOAD_URL = "https://video.kkone.vip/api/uploads";

type TempReferenceUploadResponse = { files?: Array<{ url?: string }> };

export async function uploadTemporaryReferenceFiles(files: File[]) {
    if (!files.length) return [];
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file, file.name));
    const response = await fetch(TEMP_REFERENCE_UPLOAD_URL, { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as TempReferenceUploadResponse | { msg?: string } | null;
    if (!response.ok) throw new Error((payload as { msg?: string } | null)?.msg || `参考素材上传失败：${response.status}`);
    const urls = (payload as TempReferenceUploadResponse | null)?.files?.map((file) => file.url?.trim() || "").filter(Boolean) || [];
    if (urls.length !== files.length) throw new Error("参考素材上传成功但没有返回完整文件地址");
    return urls;
}
