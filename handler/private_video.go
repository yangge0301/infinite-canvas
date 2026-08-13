package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
)

func privateVideoProtocol(channel model.ModelChannel) string {
	switch strings.ToLower(strings.TrimSpace(channel.CustomProtocol)) {
	case "kk", "kk_private", "kk-private":
		return "kk"
	case "mikito":
		return "mikito"
	case "mikito_sora", "mikito-sora", "sora":
		return "mikito_sora"
	default:
		return ""
	}
}

func isPrivateVideoProtocol(channel model.ModelChannel) bool {
	return privateVideoProtocol(channel) != ""
}

type privateVideoInput struct {
	Model         string
	Prompt        string
	Seconds       string
	AspectRatio   string
	Resolution    string
	GenerateAudio bool
	Images        []string
	Videos        []string
	Audios        []string
	FirstFrame    string
	LastFrame     string
}

func normalizePrivateVideoBody(body []byte, contentType string, modelName string, channel model.ModelChannel) ([]byte, string, error) {
	if !isPrivateVideoProtocol(channel) {
		return body, contentType, nil
	}
	input, err := readPrivateVideoInput(body, contentType, modelName, channel)
	if err != nil {
		return body, contentType, err
	}
	var result map[string]any
	switch privateVideoProtocol(channel) {
	case "kk":
		result = buildKKVideoBody(input)
	case "mikito":
		result = buildMikitoVideoBody(input)
	case "mikito_sora":
		result = buildMikitoSoraVideoBody(input)
	default:
		return body, contentType, nil
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return body, contentType, err
	}
	return encoded, "application/json", nil
}

func readPrivateVideoInput(body []byte, contentType string, modelName string, channel model.ModelChannel) (privateVideoInput, error) {
	input := privateVideoInput{Model: strings.TrimSpace(modelName), GenerateAudio: true}
	payload := map[string]any{}
	var form *multipart.Form
	if strings.HasPrefix(strings.ToLower(contentType), "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return input, err
		}
		form, err = multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(256 << 20)
		if err != nil {
			return input, err
		}
		defer form.RemoveAll()
		for key, values := range form.Value {
			if len(values) == 1 {
				payload[key] = values[0]
			} else if len(values) > 1 {
				payload[key] = values
			}
		}
	} else if len(bytes.TrimSpace(body)) > 0 {
		if err := json.Unmarshal(body, &payload); err != nil {
			return input, err
		}
	}
	if value := privateString(payload, "model"); value != "" {
		input.Model = value
	}
	input.Prompt = privateString(payload, "prompt")
	input.Seconds = privateString(payload, "seconds")
	if input.Seconds == "" {
		input.Seconds = privateString(payload, "duration")
	}
	input.AspectRatio = firstPrivateString(payload, "aspect_ratio", "ratio", "size")
	input.Resolution = firstPrivateString(payload, "resolution", "resolution_name")
	if value := firstPrivateString(payload, "video_generate_audio", "generate_audio"); value != "" {
		input.GenerateAudio = parsePrivateBool(value)
	}
	input.Images = privateStrings(payload, "images", "input_reference", "input_reference[]")
	input.Videos = privateStrings(payload, "videos", "video_reference", "video_reference[]")
	input.Audios = privateStrings(payload, "audios", "audio_reference", "audio_reference[]")
	input.FirstFrame = firstPrivateString(payload, "first_frame_url", "start_frame")
	input.LastFrame = firstPrivateString(payload, "last_frame_url", "end_frame")
	if form != nil {
		var err error
		input.Images, err = appendPrivateFiles(input.Images, form.File["input_reference[]"], channel)
		if err != nil {
			return input, err
		}
		input.Images, err = appendPrivateFiles(input.Images, form.File["input_reference"], channel)
		if err != nil {
			return input, err
		}
		input.Videos, err = appendPrivateFiles(input.Videos, form.File["video_reference[]"], channel)
		if err != nil {
			return input, err
		}
		input.Videos, err = appendPrivateFiles(input.Videos, form.File["video_reference"], channel)
		if err != nil {
			return input, err
		}
		input.Audios, err = appendPrivateFiles(input.Audios, form.File["audio_reference[]"], channel)
		if err != nil {
			return input, err
		}
		input.Audios, err = appendPrivateFiles(input.Audios, form.File["audio_reference"], channel)
		if err != nil {
			return input, err
		}
		if headers := form.File["first_frame_url"]; len(headers) > 0 {
			urls, err := appendPrivateFiles(nil, headers[:1], channel)
			if err != nil {
				return input, err
			}
			input.FirstFrame = firstPrivateString(map[string]any{"value": urls}, "value")
		}
		if headers := form.File["last_frame_url"]; len(headers) > 0 {
			urls, err := appendPrivateFiles(nil, headers[:1], channel)
			if err != nil {
				return input, err
			}
			input.LastFrame = firstPrivateString(map[string]any{"value": urls}, "value")
		}
	}
	return input, nil
}

func appendPrivateFiles(values []string, headers []*multipart.FileHeader, channel model.ModelChannel) ([]string, error) {
	files := make([]referenceUploadFile, 0, len(headers))
	for _, header := range headers {
		file, err := header.Open()
		if err != nil {
			return values, errors.New("参考素材读取失败")
		}
		data, readErr := io.ReadAll(io.LimitReader(file, referenceMediaMaxBytes+1))
		_ = file.Close()
		if readErr != nil || len(data) == 0 {
			return values, errors.New("参考素材为空")
		}
		contentType := strings.TrimSpace(header.Header.Get("Content-Type"))
		if contentType == "" || contentType == "application/octet-stream" {
			contentType = http.DetectContentType(data)
		}
		if normalized, _, ok := normalizeReferenceMediaType(contentType, filepath.Ext(header.Filename)); ok {
			contentType = normalized
		}
		files = append(files, referenceUploadFile{Name: header.Filename, Type: contentType, Data: data})
	}
	urls, err := uploadReferenceFiles(channel, files)
	if err != nil {
		return values, err
	}
	values = append(values, urls...)
	return values, nil
}

func privateString(payload map[string]any, key string) string {
	value := payload[key]
	if value == nil {
		return ""
	}
	switch typed := value.(type) {
	case []any:
		if len(typed) > 0 {
			return strings.TrimSpace(fmt.Sprint(typed[0]))
		}
	case []string:
		if len(typed) > 0 {
			return strings.TrimSpace(typed[0])
		}
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
	return ""
}

func firstPrivateString(payload map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := privateString(payload, key); value != "" {
			return value
		}
	}
	return ""
}

func privateStrings(payload map[string]any, keys ...string) []string {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok {
			continue
		}
		result := []string{}
		switch typed := value.(type) {
		case []any:
			for _, item := range typed {
				if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
					result = append(result, text)
				}
			}
		case []string:
			for _, item := range typed {
				if text := strings.TrimSpace(item); text != "" {
					result = append(result, text)
				}
			}
		default:
			if text := strings.TrimSpace(fmt.Sprint(value)); text != "" {
				result = append(result, text)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return []string{}
}

func parsePrivateBool(value string) bool {
	parsed, err := strconv.ParseBool(strings.TrimSpace(value))
	return err == nil && parsed
}

func privateDuration(value string, min int, allowed ...int) int {
	parsed, _ := strconv.Atoi(strings.TrimSpace(value))
	if parsed < min {
		parsed = min
	}
	if len(allowed) == 0 {
		return parsed
	}
	for _, item := range allowed {
		if parsed == item {
			return parsed
		}
	}
	closest := allowed[0]
	for _, item := range allowed {
		if absInt(item-parsed) < absInt(closest-parsed) {
			closest = item
		}
	}
	return closest
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func privateAspect(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if strings.Contains(value, "x") {
		parts := strings.SplitN(value, "x", 2)
		if len(parts) == 2 {
			value = ratioFromDimensions(parts[0], parts[1])
		}
	}
	if value == "" {
		return fallback
	}
	return value
}

func privateProtocolAspect(value string, allowed []string, fallback string) string {
	value = privateAspect(value, fallback)
	for _, item := range allowed {
		if value == item {
			return value
		}
	}
	return fallback
}

func normalizeKKResolution(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "480p", "720p", "1080p":
		return value
	default:
		return "720p"
	}
}

var privateReferenceLabelPattern = regexp.MustCompile(`@?参考?(图片|图|视频|音频)([1-9][0-9]*)`)

func normalizePrivatePrompt(prompt string, protocol string) string {
	if protocol != "kk" {
		return prompt
	}
	return privateReferenceLabelPattern.ReplaceAllStringFunc(prompt, func(value string) string {
		match := privateReferenceLabelPattern.FindStringSubmatch(value)
		if len(match) != 3 {
			return value
		}
		kind := match[1]
		index := match[2]
		if protocol == "kk_v1" && (kind == "图" || kind == "图片") {
			number, _ := strconv.Atoi(index)
			return fmt.Sprintf("REFERENCE_%d", maxInt(0, number-1))
		}
		switch kind {
		case "图片", "图":
			return "@Image" + index
		case "视频":
			return "@Video" + index
		case "音频":
			return "@Audio" + index
		default:
			return value
		}
	})
}

func privateImageInputs(input privateVideoInput) []string {
	images := make([]string, 0, len(input.Images)+2)
	if input.FirstFrame != "" {
		images = append(images, input.FirstFrame)
	}
	images = append(images, input.Images...)
	if input.LastFrame != "" && input.LastFrame != input.FirstFrame {
		images = append(images, input.LastFrame)
	}
	return images
}

func ratioFromDimensions(width, height string) string {
	w, _ := strconv.Atoi(strings.TrimSpace(width))
	h, _ := strconv.Atoi(strings.TrimSpace(height))
	if w <= 0 || h <= 0 {
		return ""
	}
	ratio := float64(w) / float64(h)
	options := []struct {
		name  string
		value float64
	}{{"21:9", 21.0 / 9}, {"16:9", 16.0 / 9}, {"9:16", 9.0 / 16}, {"4:3", 4.0 / 3}, {"3:4", 3.0 / 4}, {"1:1", 1}}
	best := options[0]
	for _, option := range options {
		if absFloat(option.value-ratio) < absFloat(best.value-ratio) {
			best = option
		}
	}
	return best.name
}

func absFloat(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}

func buildKKVideoBody(input privateVideoInput) map[string]any {
	aspect := privateProtocolAspect(input.AspectRatio, []string{"21:9", "16:9", "9:16", "4:3", "3:4", "1:1"}, "16:9")
	if strings.EqualFold(input.Model, "video-v1") {
		aspect = privateProtocolAspect(input.AspectRatio, []string{"16:9", "9:16", "1:1", "4:3", "3:4"}, "16:9")
	}
	protocol := "kk_v2"
	if strings.EqualFold(input.Model, "video-v1") {
		protocol = "kk_v1"
	}
	body := map[string]any{"model": input.Model, "prompt": normalizePrivatePrompt(input.Prompt, protocol), "duration": privateDuration(input.Seconds, 5, 5, 10, 15), "aspect_ratio": aspect}
	images := privateImageInputs(input)
	if strings.EqualFold(input.Model, "video-v1") {
		if len(images) > 0 {
			body["images"] = images[:minInt(9, len(images))]
		}
		return body
	}
	body["images"] = images[:minInt(9, len(images))]
	body["videos"] = input.Videos[:minInt(3, len(input.Videos))]
	body["audios"] = input.Audios[:minInt(3, len(input.Audios))]
	body["resolution"] = normalizeKKResolution(input.Resolution)
	body["generate_audio"] = input.GenerateAudio
	return body
}

func buildMikitoVideoBody(input privateVideoInput) map[string]any {
	images := privateImageInputs(input)
	images = images[:minInt(9, len(images))]
	body := map[string]any{"model": input.Model, "prompt": normalizePrivatePrompt(input.Prompt, "mikito"), "duration": minInt(15, privateDuration(input.Seconds, 4)), "aspect_ratio": privateProtocolAspect(input.AspectRatio, []string{"16:9", "9:16", "1:1", "4:3", "3:4"}, "16:9"), "images": images, "referenceVideos": input.Videos[:minInt(3, len(input.Videos))], "referenceAudios": input.Audios[:minInt(3, len(input.Audios))], "generate_audio": input.GenerateAudio}
	if len(images) >= 3 || len(input.Videos) > 0 || len(input.Audios) > 0 {
		body["reference_mode"] = "media"
	} else {
		body["reference_mode"] = "frame"
	}
	return body
}

func buildMikitoSoraVideoBody(input privateVideoInput) map[string]any {
	images := privateImageInputs(input)
	images = images[:minInt(9, len(images))]
	body := map[string]any{"model": input.Model, "prompt": normalizePrivatePrompt(input.Prompt, "mikito_sora"), "seconds": strconv.Itoa(minInt(15, privateDuration(input.Seconds, 4))), "aspect_ratio": privateAspect(input.AspectRatio, "16:9"), "resolution": "720p"}
	if len(images) > 0 {
		body["image_url"] = images[0]
	}
	if len(images) > 1 {
		body["reference_image_urls"] = images[1:]
	}
	videos := input.Videos[:minInt(3, len(input.Videos))]
	if len(videos) == 1 {
		body["reference_video"] = videos[0]
	}
	if len(videos) > 1 {
		body["reference_videos"] = videos
	}
	audios := input.Audios[:minInt(3, len(input.Audios))]
	if len(audios) == 1 {
		body["audio_url"] = audios[0]
	}
	if len(audios) > 1 {
		body["audio_url"] = audios
	}
	mode := "auto"
	if input.FirstFrame != "" && input.LastFrame != "" {
		mode = "start_end"
	} else if input.FirstFrame != "" {
		mode = "start_frame"
	}
	body["video_config"] = map[string]any{"reference_mode": mode}
	return body
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
