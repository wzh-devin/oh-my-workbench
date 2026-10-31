// 摘要图由受控SVG组成，上传的HTML/代码仅以转义文本显示，不执行或加载资源。
package main

import (
	"encoding/csv"
	"fmt"
	"html"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

func readableText(source []byte) (string, error) {
	if len(source) >= 2 && (source[0] == 0xff && source[1] == 0xfe || source[0] == 0xfe && source[1] == 0xff) {
		little := source[0] == 0xff
		units := make([]uint16, 0, (len(source)-2)/2)
		for i := 2; i+1 < len(source); i += 2 {
			value := uint16(source[i])<<8 | uint16(source[i+1])
			if little {
				value = uint16(source[i+1])<<8 | uint16(source[i])
			}
			units = append(units, value)
		}
		return string(utf16.Decode(units)), nil
	}
	// 前缀可能刚好截在UTF-8字符中间，移除不完整尾部但拒绝二进制内容。
	for i := 0; i < 3 && len(source) > 0 && !utf8.Valid(source); i++ {
		source = source[:len(source)-1]
	}
	if !utf8.Valid(source) || strings.ContainsRune(string(source), '\x00') {
		return "", fmt.Errorf("unsupported text encoding")
	}
	return strings.TrimPrefix(string(source), "\ufeff"), nil
}

func textImage(source, contentType, directory string) (string, error) {
	data, err := os.ReadFile(source)
	if err != nil {
		return "", err
	}
	text, err := readableText(data)
	if err != nil {
		return "", err
	}
	var svg strings.Builder
	svg.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/><g font-family="Noto Sans CJK SC,sans-serif" font-size="13" fill="#374151">`)
	write := func(x, y int, value string) {
		fmt.Fprintf(&svg, `<text x="%d" y="%d" xml:space="preserve">%s</text>`, x, y, html.EscapeString(value))
	}
	if contentType == "text/csv" || contentType == "text/tab-separated-values" {
		reader := csv.NewReader(strings.NewReader(text))
		reader.FieldsPerRecord = -1
		reader.LazyQuotes = true
		if contentType == "text/tab-separated-values" {
			reader.Comma = '\t'
		}
		for row := 0; row < 14; row++ {
			cells, err := reader.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", err
			}
			if row == 0 {
				svg.WriteString(`<rect x="16" y="16" width="480" height="32" fill="#f1f5f9"/>`)
			}
			columns := min(len(cells), 4)
			width := 480 / max(columns, 1)
			for column := 0; column < columns; column++ {
				write(24+column*width, 37+row*32, shortLine(cells[column], max(4, (width-16)/7)))
			}
			fmt.Fprintf(&svg, `<path d="M16 %dH496" stroke="#e2e8f0"/>`, 48+row*32)
		}
	} else {
		lines := strings.Split(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"), "\n")
		row := 0
		for _, line := range lines {
			line = strings.ReplaceAll(line, "\t", "    ")
			for _, part := range textLines(line, 60) {
				if row >= 24 {
					break
				}
				write(24, 35+row*19, part)
				row++
			}
			if row >= 24 {
				break
			}
		}
	}
	svg.WriteString(`</g></svg>`)
	output := filepath.Join(directory, "summary.svg")
	return output, os.WriteFile(output, []byte(svg.String()), 0600)
}

func textLines(text string, limit int) []string {
	lines := []string{}
	var line strings.Builder
	width := 0
	for _, r := range text {
		if unicode.IsControl(r) {
			r = ' '
		}
		units := 1
		if unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
			units = 2
		}
		if width+units > limit {
			lines = append(lines, line.String())
			line.Reset()
			width = 0
		}
		line.WriteRune(r)
		width += units
		if len(lines) >= 24 {
			break
		}
	}
	return append(lines, line.String())
}

func shortLine(text string, limit int) string {
	parts := textLines(strings.NewReplacer("\n", " ", "\r", " ").Replace(text), limit)
	if len(parts) > 1 {
		return parts[0] + "…"
	}
	return parts[0]
}
