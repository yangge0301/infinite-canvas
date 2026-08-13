package handler

import (
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
)

func isGeminiChannel(channel model.ModelChannel) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), "gemini")
}

func geminiAPIPath(modelName string) string {
	return "/models/" + strings.TrimPrefix(strings.TrimSpace(modelName), "models/") + ":generateContent"
}

func normalizeGeminiRequest(body []byte, contentType string, modelName string, endpoint string) ([]byte, string, error) {
	if strings.HasPrefix(contentType, "multipart/form-data") {
		return nil, "", errors.New("Gemini 图片编辑仅支持 JSON 请求")
	}
	if endpoint != "/images/generations" && endpoint != "/images/edits" && endpoint != "/chat/completions" && endpoint != "/responses" {
		return nil, "", errors.New("Gemini 渠道暂不支持该接口")
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", errors.New("Gemini 请求参数无效")
	}
	if endpoint == "/images/generations" || endpoint == "/images/edits" {
		prompt := stringMapValue(payload, "prompt")
		if prompt == "" {
			return nil, "", errors.New("缺少图片提示词")
		}
		parts := []any{map[string]any{"text": prompt}}
		for _, image := range geminiRequestImages(payload) {
			parts = append(parts, geminiImagePart(image))
		}
		result := map[string]any{
			"contents":         []any{map[string]any{"role": "user", "parts": parts}},
			"generationConfig": map[string]any{"responseModalities": []string{"TEXT", "IMAGE"}},
		}
		if config := geminiImageConfig(payload, modelName); len(config) > 0 {
			result["generationConfig"].(map[string]any)["responseModalities"] = []string{"TEXT", "IMAGE"}
			for key, value := range config {
				result["generationConfig"].(map[string]any)[key] = value
			}
		}
		encoded, err := json.Marshal(result)
		return encoded, "application/json", err
	}

	messages, _ := payload["messages"].([]any)
	contents := make([]any, 0, len(messages))
	var systemParts []any
	for _, item := range messages {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		content := stringMapValue(message, "content")
		if content == "" {
			continue
		}
		if strings.EqualFold(stringMapValue(message, "role"), "system") {
			systemParts = append(systemParts, map[string]any{"text": content})
			continue
		}
		role := "user"
		if strings.EqualFold(stringMapValue(message, "role"), "assistant") {
			role = "model"
		}
		contents = append(contents, map[string]any{"role": role, "parts": []any{map[string]any{"text": content}}})
	}
	if len(contents) == 0 {
		return nil, "", errors.New("Gemini 请求缺少消息内容")
	}
	result := map[string]any{"contents": contents}
	if len(systemParts) > 0 {
		result["systemInstruction"] = map[string]any{"parts": systemParts}
	}
	encoded, err := json.Marshal(result)
	return encoded, "application/json", err
}

func stringMapValue(value map[string]any, key string) string {
	text, _ := value[key].(string)
	return strings.TrimSpace(text)
}

func geminiRequestImages(payload map[string]any) []string {
	var values []any
	if image, ok := payload["image"]; ok {
		if items, ok := image.([]any); ok {
			values = append(values, items...)
		} else {
			values = append(values, image)
		}
	}
	if images, ok := payload["images"].([]any); ok {
		values = append(values, images...)
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		switch item := value.(type) {
		case string:
			if strings.TrimSpace(item) != "" {
				result = append(result, item)
			}
		case map[string]any:
			if url := stringMapValue(item, "url"); url != "" {
				result = append(result, url)
			}
		}
	}
	return result
}

func geminiImagePart(value string) map[string]any {
	if strings.HasPrefix(value, "data:") {
		parts := strings.SplitN(value, ",", 2)
		if len(parts) == 2 {
			mimeType := strings.TrimPrefix(strings.Split(parts[0], ";")[0], "data:")
			return map[string]any{"inlineData": map[string]any{"mimeType": mimeType, "data": parts[1]}}
		}
	}
	return map[string]any{"fileData": map[string]any{"fileUri": value, "mimeType": "image/png"}}
}

func geminiImageConfig(payload map[string]any, modelName string) map[string]any {
	image := map[string]any{}
	if size := stringMapValue(payload, "size"); size != "" {
		image["aspectRatio"] = geminiAspectRatio(size)
	}
	if quality := strings.ToLower(stringMapValue(payload, "quality")); quality != "" && geminiSupportsImageSize(modelName) {
		if imageSize := map[string]string{"low": "1K", "standard": "1K", "medium": "2K", "hd": "2K", "high": "4K"}[quality]; imageSize != "" {
			image["imageSize"] = imageSize
		}
	}
	if len(image) == 0 {
		return nil
	}
	return map[string]any{"imageConfig": image}
}

func geminiAspectRatio(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "auto" {
		return "1:1"
	}
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == ':' || r == 'x' || r == 'X' })
	if len(parts) != 2 {
		return "1:1"
	}
	width, widthErr := strconv.ParseFloat(parts[0], 64)
	height, heightErr := strconv.ParseFloat(parts[1], 64)
	if widthErr != nil || heightErr != nil || width <= 0 || height <= 0 {
		return "1:1"
	}
	target := width / height
	best := geminiSupportedAspectRatios[0]
	bestDistance := math.MaxFloat64
	for _, candidate := range geminiSupportedAspectRatios {
		candidateParts := strings.Split(candidate, ":")
		candidateWidth, _ := strconv.ParseFloat(candidateParts[0], 64)
		candidateHeight, _ := strconv.ParseFloat(candidateParts[1], 64)
		distance := math.Abs(candidateWidth/candidateHeight - target)
		if distance < bestDistance {
			best = candidate
			bestDistance = distance
		}
	}
	return best
}

var geminiSupportedAspectRatios = []string{"1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"}

func geminiSupportsImageSize(modelName string) bool {
	value := strings.NewReplacer(" ", "-", "_", "-").Replace(strings.ToLower(modelName))
	return strings.Contains(value, "gemini-3") || strings.Contains(value, "3.1") || strings.Contains(value, "3-pro") || strings.Contains(value, "nano-banana")
}
