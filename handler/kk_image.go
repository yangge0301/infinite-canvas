package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"mime"
	"mime/multipart"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
)

func isKKOpenAIImage2Channel(channel model.ModelChannel, modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), "openai") && strings.Contains(strings.ToLower(channel.BaseURL), "api.kkone.vip") && strings.Contains(strings.ToLower(modelName), "gpt-image-2")
}

func normalizeKKOpenAIImage2Body(body []byte, contentType string) ([]byte, string, error) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return body, contentType, err
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(256 << 20)
	if err != nil {
		return body, contentType, err
	}
	defer form.RemoveAll()

	payload := map[string]any{}
	inputURLs := []string{}
	for key, values := range form.Value {
		switch key {
		case "image", "images", "image_url", "image_urls", "input_urls":
			for _, value := range values {
				if value = strings.TrimSpace(value); value != "" {
					inputURLs = append(inputURLs, value)
				}
			}
		default:
			if len(values) == 1 {
				payload[key] = values[0]
			} else if len(values) > 1 {
				payload[key] = values
			}
		}
	}
	if len(inputURLs) == 0 {
		return body, contentType, errors.New("缺少图片参考地址")
	}
	payload["input_urls"] = inputURLs
	encoded, err := json.Marshal(payload)
	if err != nil {
		return body, contentType, err
	}
	return encoded, "application/json", nil
}
