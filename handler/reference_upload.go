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
	"net/textproto"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/service"
)

type referenceUploadFile struct {
	Name string
	Type string
	Data []byte
}

const referenceUploadEndpoint = "https://video.kkone.vip/api/uploads"

// uploadReferenceFile uploads a temporary reference file to the channel's
// provider. The returned URL is intended for the immediate generation request.
func uploadReferenceFile(channel model.ModelChannel, file referenceUploadFile) (string, error) {
	urls, err := uploadReferenceFiles(channel, []referenceUploadFile{file})
	if err != nil {
		return "", err
	}
	return urls[0], nil
}

func uploadReferenceFiles(channel model.ModelChannel, files []referenceUploadFile) ([]string, error) {
	if len(files) == 0 {
		return []string{}, nil
	}
	uploadURL := referenceUploadEndpoint

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, file := range files {
		if len(file.Data) == 0 {
			return nil, errors.New("参考素材为空")
		}
		filename := referenceUploadFilename(file.Name, file.Type)
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="files"; filename="%s"`, strings.ReplaceAll(filename, `"`, "")))
		header.Set("Content-Type", file.Type)
		part, err := writer.CreatePart(header)
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(file.Data); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	request, err := http.NewRequest(http.MethodPost, uploadURL, &body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := service.HTTPClientForChannel(channel).Do(request)
	if err != nil {
		return nil, fmt.Errorf("参考素材上传失败：%v", err)
	}
	defer response.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(response.Body, 512*1024))
	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("参考素材上传失败：%s", readUpstreamAIErrorMessage(payload, response.StatusCode))
	}
	urls := readReferenceUploadURLs(payload)
	if len(urls) >= len(files) {
		return urls[:len(files)], nil
	}
	return nil, errors.New("参考素材上传成功但没有返回文件地址")
}

func replaceReferenceFormFilesWithURLs(body []byte, contentType string, channel model.ModelChannel) ([]byte, string, error) {
	if !strings.HasPrefix(strings.ToLower(contentType), "multipart/form-data") {
		return body, contentType, nil
	}
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return body, contentType, err
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(256 << 20)
	if err != nil {
		return body, contentType, err
	}
	defer form.RemoveAll()

	fields := []string{"image", "images", "image[]", "input_reference", "input_reference[]", "reference_image", "reference_images", "reference_image_url", "reference_image_urls", "video", "videos", "video_reference", "video_reference[]", "reference_video", "reference_videos", "audio", "audios", "audio_reference", "audio_reference[]", "reference_audio", "reference_audios", "first_frame_url", "last_frame_url"}
	type uploadField struct {
		field string
		file  referenceUploadFile
	}
	uploads := []uploadField{}
	for _, field := range fields {
		for _, header := range form.File[field] {
			file, err := referenceUploadFromHeader(header)
			if err != nil {
				return body, contentType, err
			}
			uploads = append(uploads, uploadField{field: field, file: file})
		}
	}
	if len(uploads) == 0 {
		return body, contentType, nil
	}
	files := make([]referenceUploadFile, len(uploads))
	for index, upload := range uploads {
		files[index] = upload.file
	}
	urls, err := uploadReferenceFiles(channel, files)
	if err != nil {
		return body, contentType, err
	}

	var result bytes.Buffer
	writer := multipart.NewWriter(&result)
	for key, values := range form.Value {
		for _, value := range values {
			if err := writer.WriteField(key, value); err != nil {
				return body, contentType, err
			}
		}
	}
	uploadFields := map[string]bool{}
	for index, upload := range uploads {
		uploadFields[upload.field] = true
		if err := writer.WriteField(upload.field, urls[index]); err != nil {
			return body, contentType, err
		}
	}
	for field, headers := range form.File {
		if uploadFields[field] {
			continue
		}
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

func referenceUploadFromHeader(header *multipart.FileHeader) (referenceUploadFile, error) {
	file, err := header.Open()
	if err != nil {
		return referenceUploadFile{}, errors.New("参考素材读取失败")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, referenceMediaMaxBytes+1))
	if err != nil || len(data) == 0 {
		return referenceUploadFile{}, errors.New("参考素材读取失败")
	}
	contentType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = http.DetectContentType(data)
	}
	if normalized, _, ok := normalizeReferenceMediaType(contentType, filepath.Ext(header.Filename)); ok {
		contentType = normalized
	}
	return referenceUploadFile{Name: header.Filename, Type: contentType, Data: data}, nil
}

func referenceUploadFilename(name string, contentType string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == "" {
		name = "reference"
	}
	if filepath.Ext(name) != "" {
		return name
	}
	ext := ""
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg":
		ext = "jpg"
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	case "video/mp4":
		ext = "mp4"
	case "video/quicktime":
		ext = "mov"
	case "audio/mpeg":
		ext = "mp3"
	case "audio/wav", "audio/x-wav":
		ext = "wav"
	}
	if ext == "" || ext == "octet-stream" {
		ext = "bin"
	}
	return name + "." + ext
}

func readReferenceUploadURL(body []byte) string {
	return firstString(readReferenceUploadURLs(body))
}

func readReferenceUploadURLs(body []byte) []string {
	var payload any
	if len(body) == 0 || json.Unmarshal(body, &payload) != nil {
		return nil
	}
	if root, ok := payload.(map[string]any); ok {
		for _, key := range []string{"files", "data"} {
			if values, ok := root[key]; ok {
				urls := findReferenceUploadURLList(values)
				if len(urls) > 0 {
					return urls
				}
			}
		}
	}
	return findReferenceUploadURLList(payload)
}

func findReferenceUploadURL(value any) string {
	return firstString(findReferenceUploadURLList(value))
}

func findReferenceUploadURLList(value any) []string {
	result := []string{}
	switch typed := value.(type) {
	case map[string]any:
		for _, key := range []string{"url", "fileUrl", "file_url", "downloadUrl", "download_url"} {
			if candidate, ok := typed[key].(string); ok && isHTTPReferenceURL(candidate) {
				result = append(result, strings.TrimSpace(candidate))
				break
			}
		}
		for _, item := range typed {
			result = append(result, findReferenceUploadURLList(item)...)
		}
	case []any:
		for _, item := range typed {
			result = append(result, findReferenceUploadURLList(item)...)
		}
	}
	return result
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func uniqueReferenceUploadURLs(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func isHTTPReferenceURL(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}
