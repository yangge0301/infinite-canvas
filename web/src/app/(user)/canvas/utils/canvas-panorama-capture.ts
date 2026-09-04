type PanoramaCaptureHandler = () => string | null;

const captureHandlers = new Map<string, PanoramaCaptureHandler>();

export function registerPanoramaCapture(nodeId: string, handler: PanoramaCaptureHandler) {
    captureHandlers.set(nodeId, handler);
    return () => {
        if (captureHandlers.get(nodeId) === handler) captureHandlers.delete(nodeId);
    };
}

export function capturePanorama(nodeId: string) {
    return captureHandlers.get(nodeId)?.() || null;
}
