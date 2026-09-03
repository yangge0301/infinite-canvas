package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
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

	var result bytes.Buffer
	writer := multipart.NewWriter(&result)
	for key, values := range form.Value {
		if key == "response_format" {
			continue
		}
		for _, value := range values {
			if err := writer.WriteField(key, value); err != nil {
				return body, contentType, err
			}
		}
	}
	if err := writer.WriteField("response_format", "url"); err != nil {
		return body, contentType, err
	}
	for field, headers := range form.File {
		for _, header := range headers {
			file, err := header.Open()
			if err != nil {
				return body, contentType, err
			}
			part, err := writer.CreateFormFile(field, header.Filename)
			if err == nil {
				_, err = io.Copy(part, file)
			}
			_ = file.Close()
			if err != nil {
				return body, contentType, err
			}
		}
	}
	if err := writer.Close(); err != nil {
		return body, contentType, err
	}
	return result.Bytes(), writer.FormDataContentType(), nil
}

func normalizeKKOpenAIImage2GenerationBody(body []byte, contentType string) ([]byte, string, error) {
	if !strings.HasPrefix(strings.ToLower(contentType), "application/json") {
		return body, contentType, errors.New("KK gpt-image-2 文生图请求必须使用 JSON")
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return body, contentType, err
	}
	payload["response_format"] = "url"
	encoded, err := json.Marshal(payload)
	if err != nil {
		return body, contentType, err
	}
	return encoded, "application/json", nil
}
