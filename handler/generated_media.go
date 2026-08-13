package handler

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/tigerowo/infinite-canvas/service"
)

const generatedMediaMaxBytes = 512 << 20

func persistGeneratedMediaURL(rawURL string, contentType string, client *http.Client, baseURL string) (string, string, int64, error) {
	return persistGeneratedMediaURLWithHeaders(rawURL, contentType, client, baseURL, nil)
}

func persistGeneratedMediaURLWithHeaders(rawURL string, contentType string, client *http.Client, baseURL string, headers http.Header) (string, string, int64, error) {
	value := strings.TrimSpace(rawURL)
	if value == "" {
		return "", "", 0, errors.New("生成结果地址为空")
	}
	if isPersistedGeneratedMediaURL(value) {
		return value, strings.TrimSpace(strings.Split(contentType, ";")[0]), 0, nil
	}
	var data []byte
	mimeType := strings.TrimSpace(strings.Split(contentType, ";")[0])
	if strings.HasPrefix(strings.ToLower(value), "data:") {
		parts := strings.SplitN(value, ",", 2)
		if len(parts) != 2 {
			return "", "", 0, errors.New("生成结果地址无效")
		}
		meta := strings.TrimPrefix(parts[0], "data:")
		if index := strings.Index(meta, ";"); index >= 0 {
			if mimeType == "" {
				mimeType = meta[:index]
			}
			meta = meta[index+1:]
		}
		if !strings.Contains(meta, "base64") {
			return "", "", 0, errors.New("生成结果格式不支持")
		}
		decoded, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return "", "", 0, err
		}
		data = decoded
	} else {
		parsed, err := url.Parse(value)
		if err != nil {
			return "", "", 0, err
		}
		if !parsed.IsAbs() {
			base, baseErr := url.Parse(baseURL)
			if baseErr != nil || base.Scheme == "" || base.Host == "" {
				return "", "", 0, errors.New("生成结果地址无效")
			}
			parsed = base.ResolveReference(parsed)
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			return "", "", 0, errors.New("生成结果地址协议不支持")
		}
		if client == nil {
			client = service.SafeProxyHTTPClient()
		}
		request, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
		if err != nil {
			return "", "", 0, err
		}
		for key, values := range headers {
			for _, item := range values {
				request.Header.Add(key, item)
			}
		}
		response, err := client.Do(request)
		if err != nil {
			return "", "", 0, err
		}
		defer response.Body.Close()
		if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
			return "", "", 0, fmt.Errorf("下载生成结果失败：%s", response.Status)
		}
		if mimeType == "" {
			mimeType = strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])
		}
		data, err = io.ReadAll(io.LimitReader(response.Body, generatedMediaMaxBytes+1))
		if err != nil {
			return "", "", 0, err
		}
	}
	return storeGeneratedMedia(data, mimeType)
}

func isPersistedGeneratedMediaURL(value string) bool {
	return strings.HasPrefix(value, "/api/media/generated/") || strings.HasPrefix(value, "/api/files/")
}

func storeGeneratedMedia(data []byte, mimeType string) (string, string, int64, error) {
	if len(data) == 0 {
		return "", "", 0, errors.New("生成结果为空")
	}
	if int64(len(data)) > generatedMediaMaxBytes {
		return "", "", 0, errors.New("生成结果超过大小限制")
	}
	mimeType = strings.TrimSpace(strings.Split(mimeType, ";")[0])
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	if !strings.Contains(mimeType, "/") {
		mimeType = "application/octet-stream"
	}
	pathExt := extensionForGeneratedMedia(mimeType)
	id := uuid.NewString() + pathExt
	directory := generatedMediaDir()
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", "", 0, err
	}
	filePath := filepath.Join(directory, id)
	if err := os.WriteFile(filePath, data, 0o644); err != nil {
		return "", "", 0, err
	}
	return "/api/media/generated/" + id, mimeType, int64(len(data)), nil
}

func PersistGeneratedMedia(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, generatedMediaMaxBytes+1)
		if err := r.ParseMultipartForm(generatedMediaMaxBytes); err != nil {
			Fail(w, "生成结果文件过大或格式不正确")
			return
		}
		if r.MultipartForm != nil {
			defer r.MultipartForm.RemoveAll()
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			Fail(w, "缺少生成结果文件")
			return
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, generatedMediaMaxBytes+1))
		if err != nil || int64(len(data)) > generatedMediaMaxBytes {
			Fail(w, "生成结果文件过大")
			return
		}
		localURL, mimeType, bytes, err := storeGeneratedMedia(data, firstNonEmpty(header.Header.Get("Content-Type"), "application/octet-stream"))
		if err != nil {
			Fail(w, "生成结果保存失败")
			return
		}
		OK(w, map[string]any{"url": localURL, "mimeType": mimeType, "bytes": bytes})
		return
	}
	var input struct {
		URL         string `json:"url"`
		ContentType string `json:"contentType"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&input); err != nil || strings.TrimSpace(input.URL) == "" {
		Fail(w, "生成结果地址无效")
		return
	}
	localURL, mimeType, bytes, err := persistGeneratedMediaURL(input.URL, input.ContentType, nil, "")
	if err != nil {
		Fail(w, "生成结果保存失败")
		return
	}
	OK(w, map[string]any{"url": localURL, "mimeType": mimeType, "bytes": bytes})
}

func persistGeneratedMediaURLs(urls []string, contentType string, client *http.Client, baseURL string) []string {
	persisted := make([]string, 0, len(urls))
	for _, rawURL := range urls {
		localURL, _, _, err := persistGeneratedMediaURL(rawURL, contentType, client, baseURL)
		if err != nil {
			persisted = append(persisted, rawURL)
			continue
		}
		persisted = append(persisted, localURL)
	}
	return persisted
}

func persistGeneratedImageResponse(payload []byte, client *http.Client, baseURL string) ([]byte, bool) {
	var root any
	if err := json.Unmarshal(payload, &root); err != nil {
		return nil, false
	}
	changed := persistGeneratedImageValue(&root, "", client, baseURL)
	if !changed {
		return payload, true
	}
	encoded, err := json.Marshal(root)
	if err != nil {
		return nil, false
	}
	return encoded, true
}

func persistGeneratedImageValue(value *any, key string, client *http.Client, baseURL string) bool {
	switch typed := (*value).(type) {
	case map[string]any:
		changed := false
		if inline, ok := typed["inlineData"].(map[string]any); ok {
			if data, ok := inline["data"].(string); ok && data != "" {
				mimeType := firstNonEmpty(toStringSafe(inline["mimeType"]), "image/png")
				if localURL, _, _, err := persistGeneratedMediaURL("data:"+mimeType+";base64,"+data, mimeType, client, baseURL); err == nil {
					typed["fileData"] = map[string]any{"fileUri": localURL, "mimeType": mimeType}
					delete(typed, "inlineData")
					changed = true
				}
			}
		}
		for childKey, child := range typed {
			if childKey == "inlineData" {
				continue
			}
			if text, ok := child.(string); ok && isGeneratedImageValueKey(childKey, key) {
				candidate := text
				if childKey == "b64_json" && !strings.HasPrefix(candidate, "data:") {
					candidate = "data:image/png;base64," + candidate
				}
				if localURL, _, _, err := persistGeneratedMediaURL(candidate, "image/png", client, baseURL); err == nil {
					if childKey == "b64_json" {
						typed["url"] = localURL
						delete(typed, childKey)
					} else {
						typed[childKey] = localURL
					}
					changed = changed || localURL != text
				}
				continue
			}
			if persistGeneratedImageValue(&child, childKey, client, baseURL) {
				typed[childKey] = child
				changed = true
			}
		}
		return changed
	case []any:
		changed := false
		for index, child := range typed {
			if persistGeneratedImageValue(&child, key, client, baseURL) {
				typed[index] = child
				changed = true
			}
		}
		return changed
	}
	return false
}

func isGeneratedImageValueKey(key string, parentKey string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if lower == "b64_json" || lower == "image" || lower == "image_url" || lower == "imageurl" || lower == "fileuri" {
		return true
	}
	if strings.Contains(lower, "image") && strings.Contains(lower, "url") {
		return true
	}
	if lower != "url" {
		return lower == "data" && strings.EqualFold(parentKey, "fileData")
	}
	switch strings.ToLower(strings.TrimSpace(parentKey)) {
	case "", "data", "output", "result", "results", "images", "image", "candidates", "parts", "filedata":
		return true
	default:
		return false
	}
}

func generatedMediaDir() string {
	return filepath.Join(referenceDataDir(), "generated-media")
}

func GeneratedMedia(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" || id != filepath.Base(id) || strings.Contains(id, "..") {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(filepath.Join(generatedMediaDir(), id))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	if contentType := mime.TypeByExtension(filepath.Ext(id)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(w, r, id, info.ModTime(), file)
}

func extensionForGeneratedMedia(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/avif":
		return ".avif"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav":
		return ".wav"
	case "audio/ogg":
		return ".ogg"
	default:
		return ".bin"
	}
}
