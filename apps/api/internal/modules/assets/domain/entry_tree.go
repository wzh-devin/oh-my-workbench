package domain

import (
	"fmt"
	"strings"

	"golang.org/x/text/cases"
)

// 逻辑目录的可见性、深度、名称与复制规则；不访问数据库或对象存储。
func EntryMap(entries []Entry) map[int64]Entry {
	result := map[int64]Entry{}
	for _, e := range entries {
		result[e.ID] = e
	}
	return result
}

func HiddenEntry(e Entry, entries map[int64]Entry) bool {
	for depth := 0; depth <= 64; depth++ {
		if e.TrashedAt != nil {
			return true
		}
		if e.ParentID == nil {
			return false
		}
		var ok bool
		e, ok = entries[*e.ParentID]
		if !ok {
			return true
		}
	}
	return true
}

func DirectoryDepth(parent *int64, entries map[int64]Entry) (int, error) {
	depth := 0
	seen := map[int64]bool{}
	for parent != nil {
		e, ok := entries[*parent]
		if !ok || e.Kind != "folder" || HiddenEntry(e, entries) || seen[e.ID] {
			return 0, ErrNotFound
		}
		seen[e.ID] = true
		depth++
		if depth >= 64 {
			return 0, ErrInvalid
		}
		parent = e.ParentID
	}
	return depth, nil
}

func SameParent(a, b *int64) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }

func NameAvailable(entries map[int64]Entry, parent *int64, name string, exclude int64) bool {
	for _, e := range entries {
		if e.ID != exclude && e.TrashedAt == nil && SameParent(e.ParentID, parent) && NormalizeName(e.Name) == NormalizeName(name) {
			return false
		}
	}
	return true
}

// NormalizeName 与同目录去重共用 Unicode case folding，避免大小写变体绕过名称校验。
func NormalizeName(name string) string { return cases.Fold().String(name) }

func CopyName(entries map[int64]Entry, parent *int64, name string, folder bool) string {
	names := map[string]bool{}
	for _, entry := range entries {
		if entry.TrashedAt == nil && SameParent(entry.ParentID, parent) {
			names[NormalizeName(entry.Name)] = true
		}
	}
	if !names[NormalizeName(name)] {
		return name
	}
	stem, extension := name, ""
	if dot := strings.LastIndex(name, "."); !folder && dot > 0 {
		stem, extension = name[:dot], name[dot:]
	}
	for index := 1; ; index++ {
		suffix := fmt.Sprintf(" (%d)", index)
		extensionRunes := []rune(extension)
		extensionRunes = extensionRunes[:min(len(extensionRunes), max(0, 199-len([]rune(suffix))))]
		stemRunes := []rune(stem)
		limit := 200 - len([]rune(suffix)) - len(extensionRunes)
		candidate := string(stemRunes[:min(len(stemRunes), limit)]) + suffix + string(extensionRunes)
		if !names[NormalizeName(candidate)] {
			return candidate
		}
	}
}

func DescendantOf(e Entry, id int64, entries map[int64]Entry) bool {
	for depth := 0; e.ParentID != nil && depth <= 64; depth++ {
		if *e.ParentID == id {
			return true
		}
		var ok bool
		e, ok = entries[*e.ParentID]
		if !ok {
			return false
		}
	}
	return false
}

// CloneSubtrees 建立子节点和同级名称索引，只复制活动条目并保留不可变内容引用。
func CloneSubtrees(userID int64, all, roots []Entry, parent *int64) ([]Entry, []int64) {
	entries := EntryMap(all)
	children := map[int64][]Entry{}
	siblings := map[string]map[int64]Entry{}
	parentKey := func(parent *int64) string {
		if parent == nil {
			return ""
		}
		return FormatID(*parent)
	}
	for _, entry := range all {
		if entry.ParentID != nil {
			children[*entry.ParentID] = append(children[*entry.ParentID], entry)
		}
		key := parentKey(entry.ParentID)
		if siblings[key] == nil {
			siblings[key] = map[int64]Entry{}
		}
		siblings[key][entry.ID] = entry
	}
	copied := []Entry{}
	blobIDs := map[int64]bool{}
	var clone func(Entry, *int64)
	clone = func(source Entry, destination *int64) {
		if HiddenEntry(source, entries) {
			return
		}
		key := parentKey(destination)
		if siblings[key] == nil {
			siblings[key] = map[int64]Entry{}
		}
		copy := source
		copy.Base = NewBase(userID)
		copy.ParentID = destination
		copy.Name = CopyName(siblings[key], destination, source.Name, source.Kind == "folder")
		copy.NormalizedName = NormalizeName(copy.Name)
		copy.Version = 1
		copy.Starred = false
		copy.LastOpenedAt = nil
		copy.TrashedAt = nil
		copy.LegacyID = nil
		copy.LegacyRestoredAt = nil
		copied = append(copied, copy)
		siblings[key][copy.ID] = copy
		if copy.BlobID != nil {
			blobIDs[*copy.BlobID] = true
		}
		for _, child := range children[source.ID] {
			clone(child, &copy.ID)
		}
	}
	for _, root := range roots {
		clone(root, parent)
	}
	ids := make([]int64, 0, len(blobIDs))
	for id := range blobIDs {
		ids = append(ids, id)
	}
	return copied, ids
}
